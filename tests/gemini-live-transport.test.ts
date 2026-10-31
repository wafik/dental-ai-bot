import { describe, expect, it } from "bun:test";
import { GeminiLiveTransport } from "../src/features/voice/gemini-live-transport";
import type { VoiceTransportEvents } from "../src/features/voice/voice-transport";

class FakeSocket {
  static instances: FakeSocket[] = [];
  static OPEN = 1;

  readyState = 0;
  binaryType = "blob";
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  url: string;

  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  emit(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  /** Gemini frames arrive as Blob when `binaryType` is left at its default. */
  emitBinary(message: unknown): void {
    this.onmessage?.({ data: new TextEncoder().encode(JSON.stringify(message)) });
  }

  parsed(): Array<Record<string, any>> {
    return this.sent.map((entry) => JSON.parse(entry));
  }
}

class FakeContext {
  sampleRate = 48_000;
  destination = {};
  closed = false;
  processors: FakeProcessor[] = [];

  createMediaStreamSource() {
    return { connect: () => {} };
  }

  createScriptProcessor() {
    const processor = new FakeProcessor();
    this.processors.push(processor);
    return processor;
  }

  createBuffer(_channels: number, length: number) {
    return { duration: length / 24_000, getChannelData: () => new Float32Array(length) };
  }

  createBufferSource() {
    return { connect: () => {}, start: () => {}, stop: () => {}, onended: null, buffer: null };
  }

  close() {
    this.closed = true;
    return Promise.resolve();
  }
}

class FakeProcessor {
  onaudioprocess:
    | ((event: { inputBuffer: { getChannelData: () => Float32Array } }) => void)
    | null = null;
  connect() {}
  disconnect() {}
}

function first<T>(items: T[]): T {
  const value = items[0];
  if (value === undefined) throw new Error("expected at least one item");
  return value;
}

function makeEvents() {
  const transcripts: Array<[string, boolean]> = [];
  const states: string[] = [];
  const errors: Error[] = [];
  const toolCalls: Array<[string, Record<string, unknown>]> = [];
  const events: VoiceTransportEvents = {
    onState: (state) => states.push(state),
    onTranscript: (text, isUser) => transcripts.push([text, isUser]),
    onError: (error) => errors.push(error),
    onWarning: (error) => errors.push(error),
    executeTool: async (name, args) => {
      toolCalls.push([name, args]);
      return { success: true, slots: ["09:00"] };
    },
  };
  return { events, transcripts, states, errors, toolCalls };
}

function makeTransport() {
  const context = new FakeContext();
  const transport = new GeminiLiveTransport({
    fetch: (async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: {
            provider: "gemini-live",
            sessionId: "gemini-3.8-live",
            clientSecret: "auth_tokens/xyz",
            model: "gemini-3.8-live",
            voice: "Aoede",
          },
        }),
        { status: 200 },
      )) as unknown as typeof fetch,
    getUserMedia: async () => ({ getTracks: () => [], getAudioTracks: () => [] }) as any,
    WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    AudioContextImpl: function () {
      return context;
    } as unknown as typeof AudioContext,
    setupTimeoutMs: 500,
  });
  return { transport, context };
}

async function connectReady() {
  FakeSocket.instances = [];
  const { transport, context } = makeTransport();
  const harness = makeEvents();
  const pending = transport.connect(harness.events);
  // The socket is created only after the session fetch and getUserMedia settle.
  await new Promise((resolve) => setTimeout(resolve, 0));
  const socket = first(FakeSocket.instances);
  socket.open();
  socket.emitBinary({ setupComplete: {} });
  await pending;
  return { transport, context, socket, ...harness };
}

describe("GeminiLiveTransport", () => {
  it("requests a session then opens the constrained socket with the access token", async () => {
    const { socket, states } = await connectReady();

    expect(socket.url).toBe(
      "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=auth_tokens%2Fxyz",
    );
    expect(states).toContain("connected");
  });

  it("opens the stream without resending a setup frame", async () => {
    const { socket, states } = await connectReady();

    // The role, voice and tools are locked into the token by the server.
    expect(socket.parsed()).toEqual([{ setup: {} }]);
    expect(states).toContain("connected");
  });

  it("surfaces both transcript directions and speaking state", async () => {
    const { socket, transcripts, states } = await connectReady();

    socket.emit({
      serverContent: {
        inputTranscription: { text: "I need a cleaning" },
        outputTranscription: { text: "Sure, which day" },
        modelTurn: { parts: [{ inlineData: { data: "AAAA", mimeType: "audio/pcm;rate=24000" } }] },
      },
    });
    socket.emit({ serverContent: { turnComplete: true } });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(transcripts).toContainEqual(["I need a cleaning", true]);
    expect(transcripts).toContainEqual(["Sure, which day", false]);
    expect(states).toContain("speaking");
    expect(states).toContain("listening");
  });

  it("executes tool calls and replies with a toolResponse frame", async () => {
    const { socket, toolCalls } = await connectReady();

    socket.emit({
      toolCall: {
        functionCalls: [
          {
            id: "call-1",
            name: "check_availability",
            args: { serviceCode: "A", date: "2026-11-02" },
          },
        ],
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(toolCalls).toEqual([["check_availability", { serviceCode: "A", date: "2026-11-02" }]]);

    const reply = socket.parsed().find((frame) => frame.toolResponse);
    expect(reply?.toolResponse.functionResponses[0]).toEqual({
      name: "check_availability",
      id: "call-1",
      response: { output: { success: true, slots: ["09:00"] } },
    });
  });

  it("does not send microphone audio while muted", async () => {
    const { socket, transport, context } = await connectReady();

    transport.setMuted(true);
    const processor = first(context.processors);
    processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(4800) } });
    expect(socket.parsed().filter((frame) => frame.realtimeInput)).toHaveLength(0);

    transport.setMuted(false);
    // 4800 samples at 48 kHz is exactly 100 ms -> one 1600-sample 16 kHz chunk.
    processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(4800) } });
    const audioFrames = socket.parsed().filter((frame) => frame.realtimeInput);
    expect(audioFrames).toHaveLength(1);
    const frame = first(audioFrames);
    expect(frame.realtimeInput.audio.mimeType).toBe("audio/pcm;rate=16000");

    const samples = Buffer.from(frame.realtimeInput.audio.data, "base64");
    expect(samples.byteLength).toBe(3_200); // 1600 int16 samples = 100 ms at 16 kHz

    // A second 100 ms window must produce exactly one more chunk, never a short one.
    processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(4800) } });
    expect(socket.parsed().filter((frame) => frame.realtimeInput)).toHaveLength(2);
  });

  it("reports an error when the socket closes mid-call", async () => {
    const { socket, errors } = await connectReady();

    socket.onclose?.();

    expect(errors.map((error) => error.message)).toContain("Voice channel closed");
  });

  it("rejects a descriptor that is not gemini-live", async () => {
    const transport = new GeminiLiveTransport({
      fetch: (async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: { provider: "openai-realtime", clientSecret: "x" },
          }),
          { status: 200 },
        )) as unknown as typeof fetch,
      WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    });

    await expect(transport.connect(makeEvents().events)).rejects.toThrow(
      "Invalid voice session descriptor",
    );
  });
});
