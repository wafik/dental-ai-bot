import { describe, expect, it } from "bun:test";
import { OpenAICompatibleTransport } from "../src/features/voice/openai-compatible-transport";
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

  parsed(): Array<Record<string, any>> {
    return this.sent.map((entry) => JSON.parse(entry));
  }
}

class FakeContext {
  sampleRate = 48_000;
  destination = {};
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

const INSTRUCTIONS = "You are the virtual receptionist for BrightSmile Clinic.";
const TOOLS = [{ type: "function", name: "list_services", parameters: { type: "object" } }];

function makeTransport(descriptor: Record<string, unknown> = {}) {
  const context = new FakeContext();
  const transport = new OpenAICompatibleTransport({
    fetch: (async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: {
            provider: "openai-compatible",
            sessionId: "sess_1",
            endpoint: "ws://127.0.0.1:8765/v1/realtime",
            instructions: INSTRUCTIONS,
            tools: TOOLS,
            model: "gpt-realtime",
            ...descriptor,
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
  await new Promise((resolve) => setTimeout(resolve, 0));
  const socket = first(FakeSocket.instances);
  socket.open();
  expect(first(socket.parsed()).type).toBe("session.update");
  socket.emit({ type: "session.updated", session: {} });
  await pending;
  return { transport, context, socket, ...harness };
}

describe("OpenAICompatibleTransport", () => {
  it("connects to the configured endpoint and applies the server descriptor", async () => {
    const { socket, states } = await connectReady();

    expect(socket.url).toBe("ws://127.0.0.1:8765/v1/realtime");
    expect(states).toContain("connected");

    const update = first(socket.parsed());
    expect(update.type).toBe("session.update");
    expect(update.session.type).toBe("realtime");
    expect(update.session.instructions).toBe(INSTRUCTIONS);
    expect(update.session.tools).toEqual(TOOLS);
    expect(update.session.audio.input.turn_detection.type).toBe("server_vad");
  });

  it("streams microphone audio as 20 ms input_audio_buffer.append frames", async () => {
    const { transport, socket, context } = await connectReady();

    transport.setMuted(true);
    const processor = first(context.processors);
    processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(960) } });
    expect(
      socket.parsed().filter((frame) => frame.type === "input_audio_buffer.append"),
    ).toHaveLength(0);

    transport.setMuted(false);
    // 960 samples at 48 kHz is exactly 20 ms -> one 320-sample 16 kHz chunk.
    processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(960) } });

    const frames = socket.parsed().filter((frame) => frame.type === "input_audio_buffer.append");
    expect(frames).toHaveLength(1);
    expect(Buffer.from(first(frames).audio, "base64").byteLength).toBe(640);
  });

  it("plays reply audio and reports both transcripts", async () => {
    const { socket, transcripts, states } = await connectReady();

    socket.emit({
      type: "conversation.item.input_audio_transcription.completed",
      transcript: "I need a cleaning",
    });
    socket.emit({ type: "response.output_audio.delta", delta: "AAAA" });
    socket.emit({ type: "response.output_audio_transcript.delta", delta: "Sure, " });
    socket.emit({ type: "response.output_audio_transcript.delta", delta: "which day?" });
    socket.emit({
      type: "response.output_audio_transcript.done",
      transcript: "Sure, which day?",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(transcripts).toContainEqual(["I need a cleaning", true]);
    expect(transcripts).toContainEqual(["Sure, which day?", false]);
    expect(states).toContain("speaking");
  });

  it("executes a tool call, injects the output, then asks for a spoken reply", async () => {
    const { socket, toolCalls } = await connectReady();

    socket.emit({
      type: "response.function_call_arguments.done",
      call_id: "call-1",
      name: "check_availability",
      arguments: JSON.stringify({ serviceCode: "A", date: "2026-11-02" }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(toolCalls).toEqual([["check_availability", { serviceCode: "A", date: "2026-11-02" }]]);

    const output = socket.parsed().find((frame) => frame.type === "conversation.item.create");
    expect(output?.item).toEqual({
      type: "function_call_output",
      call_id: "call-1",
      output: JSON.stringify({ success: true, slots: ["09:00"] }),
    });
    expect(socket.parsed().some((frame) => frame.type === "response.create")).toBe(true);
  });

  it("drops queued audio and listens again when the patient starts talking", async () => {
    const { socket, states } = await connectReady();

    socket.emit({ type: "response.output_audio.delta", delta: "AAAA" });
    socket.emit({ type: "input_audio_buffer.speech_started" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(states).toContain("speaking");
    expect(states.at(-1)).toBe("listening");
  });

  it("rejects a descriptor that is not openai-compatible", async () => {
    const { transport } = makeTransport({ provider: "gemini-live" });

    await expect(transport.connect(makeEvents().events)).rejects.toThrow(
      "Invalid voice session descriptor",
    );
  });

  it("fails fast when the provider has no free session slot", async () => {
    FakeSocket.instances = [];
    const { transport } = makeTransport();
    const harness = makeEvents();
    const pending = transport.connect(harness.events);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const socket = first(FakeSocket.instances);
    socket.open();
    socket.emit({ type: "error", error: { type: "session_limit_reached" } });

    await expect(pending).rejects.toThrow("no free session slots");
    transport.disconnect();
  });
});
