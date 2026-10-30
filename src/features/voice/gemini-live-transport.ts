import type { VoiceTransport, VoiceTransportEvents } from "./voice-transport";

const WS_BASE =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
const INPUT_SAMPLE_RATE = 16_000;
const OUTPUT_SAMPLE_RATE = 24_000;
const CHUNK_SAMPLES = 1_600; // 100 ms at 16 kHz
const SETUP_TIMEOUT_MS = 15_000;

/**
 * Plays streamed 24 kHz PCM chunks back to back. Each chunk is buffered until
 * the first one starts, so consecutive chunks never overlap or gap.
 */
class PcmPlayer {
  private context: AudioContext | null = null;
  private nextStart = 0;
  private readonly sources = new Set<AudioBufferSourceNode>();

  constructor(private readonly AudioContextImpl: typeof AudioContext = AudioContext) {}

  play(base64: string): void {
    const context = (this.context ??= new this.AudioContextImpl({
      sampleRate: OUTPUT_SAMPLE_RATE,
    }));
    if (context.state === "suspended") void context.resume().catch(() => {});

    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const samples = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
    const buffer = context.createBuffer(1, samples.length, OUTPUT_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);

    for (let i = 0; i < samples.length; i++) {
      channel[i] = (samples[i] ?? 0) / 32768;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime, this.nextStart);
    source.start(startAt);
    this.nextStart = startAt + buffer.duration;

    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
  }

  stop(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* Already stopped. */
      }
    }

    this.sources.clear();
    this.nextStart = 0;
    const context = this.context;
    this.context = null;
    if (context) void context.close().catch(() => {});
  }
}

/** Resamples to 16 kHz and quantises to signed 16-bit PCM. */
function toPcm16(float32: Float32Array, fromRate: number): Int16Array {
  const ratio = fromRate / INPUT_SAMPLE_RATE;
  const length = Math.floor(float32.length / ratio);
  const output = new Int16Array(length);

  for (let i = 0; i < length; i++) {
    const sample = float32[Math.floor(i * ratio)] ?? 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    output[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }

  return output;
}

function toBase64(bytes: Int16Array): string {
  const view = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let binary = "";

  // ponytail: per-byte loop; swap for a chunked apply() if profiling says so.
  for (let i = 0; i < view.length; i++) {
    binary += String.fromCharCode(view[i] ?? 0);
  }

  return btoa(binary);
}

/**
 * Gemini's server frames are JSON, but the browser hands them over as a string,
 * a Blob, or an ArrayBuffer depending on `binaryType` and the user agent.
 */
async function readFrame(data: unknown): Promise<string | null> {
  if (typeof data === "string") return data;
  if (data instanceof Blob) return data.text();
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }
  return null;
}

export type GeminiLiveTransportOptions = {
  WebSocketImpl?: typeof WebSocket;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  fetch?: typeof fetch;
  AudioContextImpl?: typeof AudioContext;
  setupTimeoutMs?: number;
};

export class GeminiLiveTransport implements VoiceTransport {
  private generation = 0;
  private controller: AbortController | null = null;
  private socket: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private player: PcmPlayer | null = null;
  private muted = true;

  constructor(private readonly options: GeminiLiveTransportOptions = {}) {}

  async connect(events: VoiceTransportEvents): Promise<void> {
    const generation = ++this.generation;
    const active = () => generation === this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const request = this.options.fetch ?? fetch;
    const WS = this.options.WebSocketImpl ?? WebSocket;

    const response = await request("/api/v1/voice/session", {
      method: "POST",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Failed to fetch voice session: HTTP ${response.status}`);

    const payload = await response.json();
    const session = payload?.data;
    if (
      !payload?.success ||
      session?.provider !== "gemini-live" ||
      typeof session.clientSecret !== "string" ||
      !session.clientSecret ||
      typeof session.model !== "string" ||
      !session.model ||
      typeof session.voice !== "string" ||
      !session.voice
    ) {
      throw new Error("Invalid voice session descriptor");
    }

    if (!active()) return;

    const stream = await (
      this.options.getUserMedia ??
      ((constraints) => navigator.mediaDevices.getUserMedia(constraints))
    )({ audio: true });

    if (!active()) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }

    this.stream = stream;
    const socket = new WS(`${WS_BASE}?access_token=${encodeURIComponent(session.clientSecret)}`);
    socket.binaryType = "arraybuffer";
    this.socket = socket;

    socket.onclose = () => {
      if (active()) events.onError(new Error("Voice channel closed"));
    };

    socket.onerror = () => {
      if (active()) events.onError(new Error("Voice connection failed"));
    };

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Voice connection timed out")),
        this.options.setupTimeoutMs ?? SETUP_TIMEOUT_MS,
      );
      const fail = (error: Error) => {
        clearTimeout(timer);
        reject(error);
      };

      socket.onopen = () => {
        // The token was minted with a locked setup (model, voice, role, tools),
        // so this frame only has to open the stream.
        socket.send(JSON.stringify({ setup: {} }));
      };

      socket.onmessage = async (event) => {
        if (!active()) return;
        const raw = await readFrame(event.data);
        if (raw === null) return;
        let message: Record<string, any>;
        try {
          message = JSON.parse(raw);
        } catch {
          return;
        }
        if (!message || typeof message !== "object") return;

        if (message.setupComplete !== undefined) {
          clearTimeout(timer);
          resolve();
          return;
        }

        void this.handleMessage(message, events, socket, active);
      };

      socket.onerror = () => fail(new Error("Voice connection failed"));
      socket.onclose = () => fail(new Error("Voice channel closed"));
    });

    // The handlers above only settle the handshake; afterwards a close or a
    // transport error has to surface as a runtime failure instead.
    socket.onerror = () => {
      if (active()) events.onError(new Error("Voice connection failed"));
    };
    socket.onclose = () => {
      if (active()) events.onError(new Error("Voice channel closed"));
    };

    if (!active()) return;
    this.muted = false;
    this.player = new PcmPlayer(this.options.AudioContextImpl ?? AudioContext);
    this.startMicrophone(stream, active);
    events.onState("connected");
  }

  private startMicrophone(stream: MediaStream, active: () => boolean): void {
    const AudioContextImpl = this.options.AudioContextImpl ?? AudioContext;
    const context = new AudioContextImpl();
    this.context = context;
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    this.processor = processor;
    let carry: Float32Array = new Float32Array(0);

    processor.onaudioprocess = (event) => {
      if (!active() || this.muted || !this.socket) return;
      if (this.socket.readyState !== WebSocket.OPEN) return;

      const input = event.inputBuffer.getChannelData(0);
      const merged = new Float32Array(carry.length + input.length);
      merged.set(carry);
      merged.set(input, carry.length);

      // Resample once, then chunk: resampling a pre-cut chunk would change its length.
      const pcm = toPcm16(merged, context.sampleRate);
      const wholeSamples = pcm.length - (pcm.length % CHUNK_SAMPLES);

      for (let offset = 0; offset < wholeSamples; offset += CHUNK_SAMPLES) {
        const chunk = pcm.subarray(offset, offset + CHUNK_SAMPLES);
        this.socket.send(
          JSON.stringify({
            realtimeInput: { audio: { data: toBase64(chunk), mimeType: "audio/pcm;rate=16000" } },
          }),
        );
      }

      carry = merged.slice(Math.round(wholeSamples * (context.sampleRate / INPUT_SAMPLE_RATE)));
    };

    source.connect(processor);
    processor.connect(context.destination);
  }

  private async handleMessage(
    message: Record<string, any>,
    events: VoiceTransportEvents,
    socket: WebSocket,
    active: () => boolean,
  ): Promise<void> {
    if (message.serverContent) {
      const content = message.serverContent;

      if (content.inputTranscription?.text) {
        events.onTranscript(String(content.inputTranscription.text), true);
      }

      if (content.outputTranscription?.text) {
        events.onTranscript(String(content.outputTranscription.text), false);
      }

      const parts = content.modelTurn?.parts;
      if (Array.isArray(parts)) {
        let spoke = false;
        for (const part of parts) {
          if (typeof part?.inlineData?.data === "string") {
            if (!spoke) {
              events.onState("speaking");
              spoke = true;
            }
            this.player?.play(part.inlineData.data);
          }
        }
      }

      if (content.turnComplete) {
        events.onState("listening");
      }
    }

    if (Array.isArray(message.toolCall?.functionCalls)) {
      const functionResponses = [];
      for (const call of message.toolCall.functionCalls) {
        const name = String(call?.name ?? "");
        const args = (call?.args ?? {}) as Record<string, unknown>;
        let output: unknown;
        try {
          output = await events.executeTool(name, args);
        } catch (error) {
          output = {
            success: false,
            error: error instanceof Error ? error.message : "Tool failed",
          };
        }
        functionResponses.push({ name, id: call?.id, response: { output } });
      }

      if (!active()) return;
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ toolResponse: { functionResponses } }));
      }
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.stream) return;
    for (const track of this.stream.getAudioTracks()) {
      track.enabled = !muted;
    }
    if (muted) {
      this.player?.stop();
      this.player = new PcmPlayer(this.options.AudioContextImpl ?? AudioContext);
    }
  }

  disconnect(): void {
    ++this.generation;
    this.controller?.abort();
    this.controller = null;

    if (this.processor) {
      try {
        this.processor.disconnect();
      } catch {
        /* Already disconnected. */
      }
      this.processor = null;
    }

    if (this.context) {
      void this.context.close().catch(() => {});
      this.context = null;
    }

    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }

    this.player?.stop();
    this.player = null;

    if (this.socket) {
      this.socket.onclose = null;
      this.socket.onerror = null;
      try {
        this.socket.close();
      } catch {
        /* Already closed. */
      }
      this.socket = null;
    }
  }
}
