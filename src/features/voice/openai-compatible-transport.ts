import { PcmPlayer, readFrame, startMicrophone, type MicrophoneCapture } from "./audio";
import type { VoiceTransport, VoiceTransportEvents } from "./voice-transport";

const CHUNK_SAMPLES = 320; // 20 ms at 16 kHz
const SETUP_TIMEOUT_MS = 15_000;

export type OpenAICompatibleTransportOptions = {
  WebSocketImpl?: typeof WebSocket;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  fetch?: typeof fetch;
  AudioContextImpl?: typeof AudioContext;
  setupTimeoutMs?: number;
};

type SessionDescriptor = {
  provider: string;
  endpoint?: unknown;
  instructions?: unknown;
  tools?: unknown;
  model: string;
  voice?: unknown;
};

/**
 * Speaks the OpenAI Realtime GA WebSocket protocol to any compatible endpoint,
 * including self-hosted speech-to-speech servers.
 */
export class OpenAICompatibleTransport implements VoiceTransport {
  private generation = 0;
  private controller: AbortController | null = null;
  private socket: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private microphone: MicrophoneCapture | null = null;
  private player: PcmPlayer | null = null;
  private muted = true;
  private assistantTranscript = "";

  constructor(private readonly options: OpenAICompatibleTransportOptions = {}) {}

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
    const session = payload?.data as SessionDescriptor | undefined;
    if (
      !payload?.success ||
      session?.provider !== "openai-compatible" ||
      typeof session.endpoint !== "string" ||
      !session.endpoint
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
    const socket = new WS(session.endpoint);
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
        // The endpoint has no server-side token, so the role and tools sent here
        // are the server's own descriptor rather than a client copy.
        socket.send(
          JSON.stringify({
            type: "session.update",
            session: {
              type: "realtime",
              instructions: typeof session.instructions === "string" ? session.instructions : "",
              tools: Array.isArray(session.tools) ? session.tools : [],
              audio: { input: { turn_detection: { type: "server_vad" } } },
            },
          }),
        );
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

        if (message.type === "session.updated") {
          clearTimeout(timer);
          resolve();
          return;
        }

        if (message.type === "error") {
          fail(new Error(this.errorMessage(message)));
          return;
        }

        void this.handleMessage(message, events, socket, active);
      };

      socket.onerror = () => fail(new Error("Voice connection failed"));
      socket.onclose = () => fail(new Error("Voice channel closed"));
    });

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
      onChunk: (audio) => {
        if (this.muted) return;
        const socket = this.socket;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify({ type: "input_audio_buffer.append", audio }));
      },
    });
    events.onState("connected");
  }

  private errorMessage(message: Record<string, any>): string {
    const type = message.error?.type;
    if (type === "session_limit_reached") return "Voice provider has no free session slots";
    if (type === "invalid_session_type") return "Voice provider rejected the session type";
    return "Voice provider reported an error";
  }

  private async handleMessage(
    message: Record<string, any>,
    events: VoiceTransportEvents,
    socket: WebSocket,
    active: () => boolean,
  ): Promise<void> {
    switch (message.type) {
      case "input_audio_buffer.speech_started":
        // Barge-in: the server drops its own response, so drop queued audio too.
        this.player?.flush();
        this.assistantTranscript = "";
        events.onState("listening");
        return;

      case "conversation.item.input_audio_transcription.completed":
        if (typeof message.transcript === "string" && message.transcript.trim()) {
          events.onTranscript(message.transcript.trim(), true);
        }
        return;

      case "response.output_audio.delta":
        if (typeof message.delta === "string") {
          events.onState("speaking");
          this.player?.play(message.delta);
        }
        return;

      case "response.output_audio_transcript.delta":
        if (typeof message.delta === "string") this.assistantTranscript += message.delta;
        return;

      case "response.output_audio_transcript.done": {
        const text =
          typeof message.transcript === "string" && message.transcript.trim()
            ? message.transcript.trim()
            : this.assistantTranscript.trim();
        if (text) events.onTranscript(text, false);
        this.assistantTranscript = "";
        return;
      }

      case "response.function_call_arguments.done":
        await this.handleToolCall(message, events, socket, active);
        return;

      case "error":
        events.onWarning(new Error(this.errorMessage(message)));
        return;

      default:
    }
  }

  private async handleToolCall(
    message: Record<string, any>,
    events: VoiceTransportEvents,
    socket: WebSocket,
    active: () => boolean,
  ): Promise<void> {
    if (typeof message.call_id !== "string" || typeof message.name !== "string") return;

    let args: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(typeof message.arguments === "string" ? message.arguments : "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      /* Invalid arguments are rejected by the tool route. */
    }

    let result: unknown;
    try {
      result = await events.executeTool(message.name, args);
    } catch {
      result = { success: false, error: "Tool execution failed" };
    }

    if (!active() || socket.readyState !== WebSocket.OPEN) return;

    // The protocol needs the output injected, then an explicit response to speak it.
    socket.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: message.call_id,
          output: typeof result === "string" ? result : JSON.stringify(result),
        },
      }),
    );
    socket.send(JSON.stringify({ type: "response.create" }));
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
