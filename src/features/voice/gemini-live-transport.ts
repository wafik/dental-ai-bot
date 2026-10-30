import { PcmPlayer, readFrame, startMicrophone, type MicrophoneCapture } from "./audio";
import type { VoiceTransport, VoiceTransportEvents } from "./voice-transport";

const WS_BASE =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
const CHUNK_SAMPLES = 1_600; // 100 ms at 16 kHz
const SETUP_TIMEOUT_MS = 15_000;

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
  private microphone: MicrophoneCapture | null = null;
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
    this.microphone = startMicrophone({
      stream,
      chunkSamples: CHUNK_SAMPLES,
      isActive: active,
      AudioContextImpl: this.options.AudioContextImpl,
      onChunk: (data) => {
        if (this.muted) return;
        const socket = this.socket;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        socket.send(
          JSON.stringify({
            realtimeInput: { audio: { data, mimeType: "audio/pcm;rate=16000" } },
          }),
        );
      },
    });
    events.onState("connected");
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
      this.player?.flush();
    }
  }

  disconnect(): void {
    ++this.generation;
    this.controller?.abort();
    this.controller = null;

    this.microphone?.stop();
    this.microphone = null;

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
