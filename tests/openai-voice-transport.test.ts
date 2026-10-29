import { describe, expect, it, mock } from "bun:test";
import { OpenAIVoiceTransport } from "../src/features/voice/openai-voice-transport";
import type { VoiceTransportEvents } from "../src/features/voice/voice-transport";

function setup() {
  const track = { enabled: true, stop: mock(() => {}) };
  const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
  const channel = {
    onmessage: null as null | ((event: { data: string }) => void),
    onclose: null as null | (() => void),
    onopen: null as null | (() => void),
    readyState: "connecting",
    send: mock(() => {}),
    close: mock(() => {}),
  };
  const peer = {
    ontrack: null,
    onconnectionstatechange: null as null | (() => void),
    connectionState: "new",
    createDataChannel: mock(() => channel),
    addTrack: mock(() => {}),
    createOffer: async () => ({ sdp: "offer" }),
    setLocalDescription: async () => {},
    setRemoteDescription: mock(async () => {
      channel.readyState = "open";
      channel.onopen?.();
    }),
    close: mock(() => {}),
  };
  const events: VoiceTransportEvents = {
    onState: mock(() => {}),
    onTranscript: mock(() => {}),
    onError: mock(() => {}),
    onWarning: mock(() => {}),
    executeTool: mock(async () => ({ success: true })),
  };
  const descriptor = {
    provider: "openai-realtime",
    sessionId: "session",
    clientSecret: "ephemeral",
    model: "model+test",
    voice: "alloy",
  };
  return { track, stream, channel, peer, events, descriptor };
}

describe("OpenAI voice transport", () => {
  it("negotiates, maps events and returns tool results", async () => {
    const { track, stream, channel, peer, events, descriptor } = setup();
    const requests: string[] = [];
    const request = mock(async (url: string | URL | Request) => {
      requests.push(String(url));
      return requests.length === 1
        ? Response.json({ success: true, data: descriptor })
        : new Response("answer");
    });
    const transport = new OpenAIVoiceTransport({
      fetch: request as unknown as typeof fetch,
      getUserMedia: async () => stream as unknown as MediaStream,
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
    });
    await transport.connect(events);
    expect(requests[1]).toBe("https://api.openai.com/v1/realtime?model=model%2Btest");
    expect(peer.setRemoteDescription).toHaveBeenCalledWith({ type: "answer", sdp: "answer" });
    channel.onmessage!({ data: "null" });
    channel.onmessage!({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) });
    expect(events.onState).toHaveBeenCalledWith("listening");
    channel.onmessage!({
      data: JSON.stringify({ type: "response.audio.delta", delta: "binary-audio" }),
    });
    expect(events.onTranscript).not.toHaveBeenCalled();
    channel.onmessage!({
      data: JSON.stringify({ type: "response.audio_transcript.delta", delta: "Hello" }),
    });
    expect(events.onTranscript).toHaveBeenCalledWith("Hello", false);
    channel.onmessage!({
      data: JSON.stringify({
        type: "conversation.item.input_audio_transcription.completed",
        transcript: "Hi",
      }),
    });
    expect(events.onTranscript).toHaveBeenCalledWith("Hi", true);
    expect(events.onState).toHaveBeenCalledWith("speaking");
    channel.onmessage!({ data: JSON.stringify({ type: "response.created" }) });
    channel.onmessage!({
      data: JSON.stringify({
        type: "response.function_call_arguments.done",
        call_id: "call",
        name: "book",
        arguments: "{}",
      }),
    });
    await Promise.resolve();
    expect(channel.send).toHaveBeenCalledTimes(1);
    channel.onmessage!({ data: JSON.stringify({ type: "response.done" }) });
    expect(events.onState).toHaveBeenCalledWith("connected");
    expect(channel.send).toHaveBeenCalledTimes(2);
    const sent = channel.send.mock.calls as unknown as Array<[string]>;
    expect(JSON.parse(sent[0]![0])).toEqual({
      type: "conversation.item.create",
      event_id: expect.any(String),
      item: {
        id: expect.any(String),
        type: "function_call_output",
        call_id: "call",
        output: JSON.stringify({ success: true }),
      },
    });
    expect(JSON.parse(sent[1]![0])).toEqual({
      type: "response.create",
      event_id: expect.any(String),
      response: { metadata: { voice_event_id: expect.any(String) } },
    });
    transport.setMuted(true);
    expect(track.enabled).toBe(false);
    transport.disconnect();
    expect(track.stop).toHaveBeenCalled();
    expect(peer.close).toHaveBeenCalled();
  });

  it("waits for the data channel to open before connecting", async () => {
    const { stream, channel, peer, events, descriptor } = setup();
    peer.setRemoteDescription = mock(async () => {});
    let calls = 0;
    const request = mock(async () =>
      ++calls === 1 ? Response.json({ success: true, data: descriptor }) : new Response("answer"),
    );
    const transport = new OpenAIVoiceTransport({
      fetch: request as unknown as typeof fetch,
      getUserMedia: async () => stream as unknown as MediaStream,
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
    });
    let connected = false;
    const connecting = transport.connect(events).then(() => {
      connected = true;
    });
    while (!peer.setRemoteDescription.mock.calls.length) await Promise.resolve();
    await Promise.resolve();
    expect(connected).toBe(false);
    expect(events.onState).not.toHaveBeenCalledWith("connected");
    channel.readyState = "open";
    channel.onopen!();
    await connecting;
    expect(events.onState).toHaveBeenCalledWith("connected");
    transport.disconnect();
  });

  it("fails when the data channel closes before opening", async () => {
    const { stream, channel, peer, events, descriptor } = setup();
    peer.setRemoteDescription = mock(async () => {});
    let calls = 0;
    const request = mock(async () =>
      ++calls === 1 ? Response.json({ success: true, data: descriptor }) : new Response("answer"),
    );
    const transport = new OpenAIVoiceTransport({
      fetch: request as unknown as typeof fetch,
      getUserMedia: async () => stream as unknown as MediaStream,
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
    });
    const connecting = transport.connect(events);
    while (!channel.onopen) await Promise.resolve();
    channel.readyState = "closed";
    channel.onclose!();
    await expect(connecting).rejects.toThrow("Voice channel closed");
  });

  it("times out a channel that never opens", async () => {
    const { track, stream, peer, events, descriptor } = setup();
    peer.setRemoteDescription = mock(async () => {});
    let calls = 0;
    const request = mock(async () =>
      ++calls === 1 ? Response.json({ success: true, data: descriptor }) : new Response("answer"),
    );
    const transport = new OpenAIVoiceTransport({
      fetch: request as unknown as typeof fetch,
      getUserMedia: async () => stream as unknown as MediaStream,
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
      channelOpenTimeoutMs: 1,
    });
    await expect(transport.connect(events)).rejects.toThrow("Voice channel connection timed out");
    expect(track.stop).toHaveBeenCalled();
    expect(peer.close).toHaveBeenCalled();
  });

  it("settles a connection cancelled while waiting for the channel", async () => {
    const { stream, channel, peer, events, descriptor } = setup();
    peer.setRemoteDescription = mock(async () => {});
    let calls = 0;
    const request = mock(async () =>
      ++calls === 1 ? Response.json({ success: true, data: descriptor }) : new Response("answer"),
    );
    const transport = new OpenAIVoiceTransport({
      fetch: request as unknown as typeof fetch,
      getUserMedia: async () => stream as unknown as MediaStream,
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
    });
    const connecting = transport.connect(events);
    while (!channel.onopen) await Promise.resolve();
    transport.disconnect();
    await connecting;
    expect(events.onState).not.toHaveBeenCalledWith("connected");
  });

  it("allows a transient disconnection to recover and reports a failed peer", async () => {
    const { stream, peer, events, descriptor } = setup();
    let calls = 0;
    const request = mock(async () =>
      ++calls === 1 ? Response.json({ success: true, data: descriptor }) : new Response("answer"),
    );
    const transport = new OpenAIVoiceTransport({
      fetch: request as unknown as typeof fetch,
      getUserMedia: async () => stream as unknown as MediaStream,
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
    });
    await transport.connect(events);
    peer.connectionState = "disconnected";
    peer.onconnectionstatechange!();
    expect(events.onError).not.toHaveBeenCalled();
    peer.connectionState = "connected";
    peer.onconnectionstatechange!();
    expect(events.onError).not.toHaveBeenCalled();
    peer.connectionState = "failed";
    peer.onconnectionstatechange!();
    expect(events.onError).toHaveBeenCalledWith(new Error("Voice connection failed"));
    transport.disconnect();
  });

  it("coordinates concurrent tool outputs and handles protocol errors without disconnecting", async () => {
    const { stream, channel, peer, events, descriptor } = setup();
    const resolvers: Array<(result: unknown) => void> = [];
    events.executeTool = () => new Promise((resolve) => resolvers.push(resolve));
    let calls = 0;
    const request = mock(async () =>
      ++calls === 1 ? Response.json({ success: true, data: descriptor }) : new Response("answer"),
    );
    const transport = new OpenAIVoiceTransport({
      fetch: request as unknown as typeof fetch,
      getUserMedia: async () => stream as unknown as MediaStream,
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
    });
    await transport.connect(events);
    const emit = (message: object) => channel.onmessage!({ data: JSON.stringify(message) });
    emit({ type: "response.created" });
    for (const call_id of ["one", "two"]) {
      emit({
        type: "response.function_call_arguments.done",
        call_id,
        name: "book",
        arguments: "{}",
      });
    }
    emit({ type: "response.done" });
    resolvers[0]!({ success: true });
    await Promise.resolve();
    expect(channel.send).toHaveBeenCalledTimes(1);
    resolvers[1]!({ success: true });
    await Promise.resolve();
    expect(channel.send).toHaveBeenCalledTimes(3);
    const sent = channel.send.mock.calls as unknown as Array<[string]>;
    expect(sent.map(([value]) => JSON.parse(value).type)).toEqual([
      "conversation.item.create",
      "conversation.item.create",
      "response.create",
    ]);
    emit({ type: "error", error: { code: "some_recoverable_error" } });
    expect(events.onError).not.toHaveBeenCalled();
    expect(events.onWarning).toHaveBeenCalledWith(new Error("Voice provider reported an error"));
    transport.disconnect();
  });

  it("reports a rejected response request as a connection failure", async () => {
    const { stream, channel, peer, events, descriptor } = setup();
    let calls = 0;
    const request = mock(async () =>
      ++calls === 1 ? Response.json({ success: true, data: descriptor }) : new Response("answer"),
    );
    const transport = new OpenAIVoiceTransport({
      fetch: request as unknown as typeof fetch,
      getUserMedia: async () => stream as unknown as MediaStream,
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
    });
    await transport.connect(events);
    const emit = (message: object) => channel.onmessage!({ data: JSON.stringify(message) });
    emit({ type: "response.created" });
    emit({ type: "response.function_call_arguments.done", call_id: "one", name: "book" });
    await Promise.resolve();
    emit({ type: "response.done" });
    const sent = channel.send.mock.calls as unknown as Array<[string]>;
    const requestEvent = JSON.parse(sent[1]![0]);
    expect(typeof requestEvent.event_id).toBe("string");
    emit({ type: "response.created" });
    emit({ type: "error", error: { event_id: requestEvent.event_id, code: "invalid_request" } });
    expect(events.onError).toHaveBeenCalledWith(new Error("Voice provider rejected a response"));
    transport.disconnect();
  });

  it("does not treat a completed response's late error as a new fatal failure", async () => {
    const { stream, channel, peer, events, descriptor } = setup();
    let calls = 0;
    const request = mock(async () =>
      ++calls === 1 ? Response.json({ success: true, data: descriptor }) : new Response("answer"),
    );
    const transport = new OpenAIVoiceTransport({
      fetch: request as unknown as typeof fetch,
      getUserMedia: async () => stream as unknown as MediaStream,
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
    });
    await transport.connect(events);
    const emit = (message: object) => channel.onmessage!({ data: JSON.stringify(message) });
    emit({ type: "response.created" });
    emit({ type: "response.function_call_arguments.done", call_id: "one", name: "book" });
    await Promise.resolve();
    emit({ type: "response.done" });
    const sent = channel.send.mock.calls as unknown as Array<[string]>;
    const eventId = JSON.parse(sent[1]![0]).event_id;
    emit({ type: "response.created" });
    emit({ type: "response.done", response: { metadata: { voice_event_id: eventId } } });
    emit({ type: "error", error: { event_id: eventId } });
    expect(events.onError).not.toHaveBeenCalled();
    transport.disconnect();
  });

  it("reports a rejected tool output rather than silently continuing", async () => {
    const { stream, channel, peer, events, descriptor } = setup();
    let calls = 0;
    const request = mock(async () =>
      ++calls === 1 ? Response.json({ success: true, data: descriptor }) : new Response("answer"),
    );
    const transport = new OpenAIVoiceTransport({
      fetch: request as unknown as typeof fetch,
      getUserMedia: async () => stream as unknown as MediaStream,
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
    });
    await transport.connect(events);
    const emit = (message: object) => channel.onmessage!({ data: JSON.stringify(message) });
    emit({ type: "response.created" });
    emit({ type: "response.function_call_arguments.done", call_id: "one", name: "book" });
    await Promise.resolve();
    const sent = channel.send.mock.calls as unknown as Array<[string]>;
    const eventId = JSON.parse(sent[0]![0]).event_id;
    expect(typeof eventId).toBe("string");
    emit({ type: "error", error: { event_id: eventId } });
    expect(events.onError).toHaveBeenCalledWith(new Error("Voice provider rejected a tool result"));
    transport.disconnect();
  });

  it("clears tool error correlation after provider acknowledges the item", async () => {
    const { stream, channel, peer, events, descriptor } = setup();
    let calls = 0;
    const request = mock(async () =>
      ++calls === 1 ? Response.json({ success: true, data: descriptor }) : new Response("answer"),
    );
    const transport = new OpenAIVoiceTransport({
      fetch: request as unknown as typeof fetch,
      getUserMedia: async () => stream as unknown as MediaStream,
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
    });
    await transport.connect(events);
    const emit = (message: object) => channel.onmessage!({ data: JSON.stringify(message) });
    emit({ type: "response.created" });
    emit({ type: "response.function_call_arguments.done", call_id: "one", name: "book" });
    await Promise.resolve();
    const sent = channel.send.mock.calls as unknown as Array<[string]>;
    const created = JSON.parse(sent[0]![0]);
    expect(typeof created.item.id).toBe("string");
    emit({ type: "conversation.item.created", item: { id: created.item.id } });
    emit({ type: "error", error: { event_id: created.event_id } });
    expect(events.onError).not.toHaveBeenCalled();
    transport.disconnect();
  });

  it("reports a failed response without exposing provider details", async () => {
    const { stream, channel, peer, events, descriptor } = setup();
    let calls = 0;
    const request = mock(async () =>
      ++calls === 1 ? Response.json({ success: true, data: descriptor }) : new Response("answer"),
    );
    const transport = new OpenAIVoiceTransport({
      fetch: request as unknown as typeof fetch,
      getUserMedia: async () => stream as unknown as MediaStream,
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
    });
    await transport.connect(events);
    channel.onmessage!({
      data: JSON.stringify({
        type: "response.done",
        response: { status: "failed", status_details: { error: { message: "private" } } },
      }),
    });
    expect(events.onWarning).toHaveBeenCalledWith(
      new Error("Voice provider could not complete a response"),
    );
    transport.disconnect();
  });

  it("retries a response rejected because an automatic response is active", async () => {
    const { stream, channel, peer, events, descriptor } = setup();
    let calls = 0;
    const request = mock(async () =>
      ++calls === 1 ? Response.json({ success: true, data: descriptor }) : new Response("answer"),
    );
    const transport = new OpenAIVoiceTransport({
      fetch: request as unknown as typeof fetch,
      getUserMedia: async () => stream as unknown as MediaStream,
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
    });
    await transport.connect(events);
    const emit = (message: object) => channel.onmessage!({ data: JSON.stringify(message) });
    emit({ type: "response.created" });
    emit({ type: "response.function_call_arguments.done", call_id: "one", name: "book" });
    await Promise.resolve();
    emit({ type: "response.done" });
    const sent = channel.send.mock.calls as unknown as Array<[string]>;
    const eventId = JSON.parse(sent[1]![0]).event_id;
    emit({
      type: "error",
      error: { event_id: eventId, code: "conversation_already_has_active_response" },
    });
    expect(events.onError).not.toHaveBeenCalled();
    expect(channel.send).toHaveBeenCalledTimes(2);
    emit({ type: "response.created", response: { id: "automatic" } });
    emit({ type: "response.done", response: { id: "automatic" } });
    expect(channel.send).toHaveBeenCalledTimes(3);
    expect(JSON.parse(sent[2]![0]).type).toBe("response.create");
    transport.disconnect();
  });

  it("reports an overlap that never finishes", async () => {
    const { stream, channel, peer, events, descriptor } = setup();
    let calls = 0;
    const request = mock(async () =>
      ++calls === 1 ? Response.json({ success: true, data: descriptor }) : new Response("answer"),
    );
    const transport = new OpenAIVoiceTransport({
      fetch: request as unknown as typeof fetch,
      getUserMedia: async () => stream as unknown as MediaStream,
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
      responseWaitTimeoutMs: 1,
    });
    await transport.connect(events);
    const emit = (message: object) => channel.onmessage!({ data: JSON.stringify(message) });
    emit({ type: "response.created" });
    emit({ type: "response.function_call_arguments.done", call_id: "one", name: "book" });
    await Promise.resolve();
    emit({ type: "response.done" });
    const sent = channel.send.mock.calls as unknown as Array<[string]>;
    emit({
      type: "error",
      error: {
        event_id: JSON.parse(sent[1]![0]).event_id,
        code: "conversation_already_has_active_response",
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(events.onError).toHaveBeenCalledWith(new Error("Voice provider response timed out"));
    transport.disconnect();
  });

  it("stops retrying repeated active-response rejections", async () => {
    const { stream, channel, peer, events, descriptor } = setup();
    let calls = 0;
    const request = mock(async () =>
      ++calls === 1 ? Response.json({ success: true, data: descriptor }) : new Response("answer"),
    );
    const transport = new OpenAIVoiceTransport({
      fetch: request as unknown as typeof fetch,
      getUserMedia: async () => stream as unknown as MediaStream,
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
    });
    await transport.connect(events);
    const emit = (message: object) => channel.onmessage!({ data: JSON.stringify(message) });
    emit({ type: "response.created" });
    emit({ type: "response.function_call_arguments.done", call_id: "one", name: "book" });
    await Promise.resolve();
    emit({ type: "response.done" });
    const sent = channel.send.mock.calls as unknown as Array<[string]>;
    for (let i = 0; i < 4; i++) {
      const eventId = JSON.parse(sent[i + 1]![0]).event_id;
      emit({ type: "response.created", response: { id: `automatic-${i}` } });
      emit({ type: "response.done", response: { id: `automatic-${i}` } });
      emit({
        type: "error",
        error: { event_id: eventId, code: "conversation_already_has_active_response" },
      });
    }
    expect(channel.send).toHaveBeenCalledTimes(5);
    expect(events.onError).toHaveBeenCalledWith(
      new Error("Voice provider could not start a response"),
    );
    transport.disconnect();
  });

  it("retries when the competing response completes before its rejection arrives", async () => {
    const { stream, channel, peer, events, descriptor } = setup();
    let calls = 0;
    const request = mock(async () =>
      ++calls === 1 ? Response.json({ success: true, data: descriptor }) : new Response("answer"),
    );
    const transport = new OpenAIVoiceTransport({
      fetch: request as unknown as typeof fetch,
      getUserMedia: async () => stream as unknown as MediaStream,
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
    });
    await transport.connect(events);
    const emit = (message: object) => channel.onmessage!({ data: JSON.stringify(message) });
    emit({ type: "response.created", response: { id: "first" } });
    emit({ type: "response.function_call_arguments.done", call_id: "one", name: "book" });
    await Promise.resolve();
    emit({ type: "response.done", response: { id: "first" } });
    const sent = channel.send.mock.calls as unknown as Array<[string]>;
    const eventId = JSON.parse(sent[1]![0]).event_id;
    emit({ type: "response.created", response: { id: "automatic" } });
    emit({ type: "response.done", response: { id: "automatic" } });
    emit({
      type: "error",
      error: { event_id: eventId, code: "conversation_already_has_active_response" },
    });
    expect(channel.send).toHaveBeenCalledTimes(3);
    expect(JSON.parse(sent[2]![0]).type).toBe("response.create");
    transport.disconnect();
  });

  it("does not lose a pending rejection when another response completes", async () => {
    const { stream, channel, peer, events, descriptor } = setup();
    let calls = 0;
    const request = mock(async () =>
      ++calls === 1 ? Response.json({ success: true, data: descriptor }) : new Response("answer"),
    );
    const transport = new OpenAIVoiceTransport({
      fetch: request as unknown as typeof fetch,
      getUserMedia: async () => stream as unknown as MediaStream,
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
    });
    await transport.connect(events);
    const emit = (message: object) => channel.onmessage!({ data: JSON.stringify(message) });
    emit({ type: "response.created", response: { id: "first" } });
    emit({ type: "response.function_call_arguments.done", call_id: "one", name: "book" });
    await Promise.resolve();
    emit({ type: "response.done", response: { id: "first" } });
    const sent = channel.send.mock.calls as unknown as Array<[string]>;
    const eventId = JSON.parse(sent[1]![0]).event_id;
    emit({ type: "response.created", response: { id: "automatic" } });
    emit({ type: "response.done", response: { id: "automatic" } });
    emit({ type: "response.function_call_arguments.done", call_id: "two", name: "book" });
    await Promise.resolve();
    expect(channel.send).toHaveBeenCalledTimes(3);
    emit({ type: "error", error: { event_id: eventId } });
    expect(events.onError).toHaveBeenCalledWith(new Error("Voice provider rejected a response"));
    transport.disconnect();
  });

  it("reports a remotely closed channel", async () => {
    const { stream, channel, peer, events, descriptor } = setup();
    let calls = 0;
    const request = mock(async () =>
      ++calls === 1 ? Response.json({ success: true, data: descriptor }) : new Response("answer"),
    );
    const transport = new OpenAIVoiceTransport({
      fetch: request as unknown as typeof fetch,
      getUserMedia: async () => stream as unknown as MediaStream,
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
    });
    await transport.connect(events);
    channel.onclose!();
    expect(events.onError).toHaveBeenCalledWith(new Error("Voice channel closed"));
    transport.disconnect();
  });

  it("suppresses tool output after disconnect while the tool is running", async () => {
    const { stream, channel, peer, events, descriptor } = setup();
    let resolve!: (result: unknown) => void;
    events.executeTool = () =>
      new Promise((r) => {
        resolve = r;
      });
    let calls = 0;
    const request = mock(async () =>
      ++calls === 1 ? Response.json({ success: true, data: descriptor }) : new Response("answer"),
    );
    const transport = new OpenAIVoiceTransport({
      fetch: request as unknown as typeof fetch,
      getUserMedia: async () => stream as unknown as MediaStream,
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
    });
    await transport.connect(events);
    channel.onmessage!({
      data: JSON.stringify({
        type: "response.function_call_arguments.done",
        call_id: "call",
        name: "book",
        arguments: "{}",
      }),
    });
    transport.disconnect();
    resolve({ success: true });
    await Promise.resolve();
    expect(channel.send).not.toHaveBeenCalled();
  });

  it("releases resources after SDP failure", async () => {
    const { track, stream, peer, events, descriptor } = setup();
    let calls = 0;
    const request = mock(async () =>
      ++calls === 1
        ? Response.json({ success: true, data: descriptor })
        : new Response(null, { status: 500 }),
    );
    const transport = new OpenAIVoiceTransport({
      fetch: request as unknown as typeof fetch,
      getUserMedia: async () => stream as unknown as MediaStream,
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
    });
    await expect(transport.connect(events)).rejects.toThrow("HTTP 500");
    expect(track.stop).toHaveBeenCalled();
    expect(peer.close).toHaveBeenCalled();
  });

  it("still stops microphone tracks if closing the channel fails", async () => {
    const { track, stream, channel, peer, events, descriptor } = setup();
    channel.close = mock(() => {
      throw new Error("close failed");
    });
    let calls = 0;
    const request = mock(async () =>
      ++calls === 1 ? Response.json({ success: true, data: descriptor }) : new Response("answer"),
    );
    const transport = new OpenAIVoiceTransport({
      fetch: request as unknown as typeof fetch,
      getUserMedia: async () => stream as unknown as MediaStream,
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
    });
    await transport.connect(events);
    transport.disconnect();
    expect(track.stop).toHaveBeenCalled();
    expect(peer.close).toHaveBeenCalled();
  });

  it("rejects another provider before obtaining microphone access", async () => {
    const { events, descriptor } = setup();
    const microphone = mock(async () => {
      throw new Error("unexpected microphone");
    });
    const request = mock(async () =>
      Response.json({ success: true, data: { ...descriptor, provider: "other" } }),
    );
    const transport = new OpenAIVoiceTransport({
      fetch: request as unknown as typeof fetch,
      getUserMedia: microphone,
    });
    await expect(transport.connect(events)).rejects.toThrow("Invalid voice session descriptor");
    expect(microphone).not.toHaveBeenCalled();
  });

  it("rejects a missing provider before microphone access", async () => {
    const { events, descriptor } = setup();
    const microphone = mock(async () => {
      throw new Error("unexpected microphone");
    });
    const request = mock(async () =>
      Response.json({ success: true, data: { ...descriptor, provider: undefined } }),
    );
    const transport = new OpenAIVoiceTransport({
      fetch: request as unknown as typeof fetch,
      getUserMedia: microphone,
    });
    await expect(transport.connect(events)).rejects.toThrow("Invalid voice session descriptor");
    expect(microphone).not.toHaveBeenCalled();
  });

  it("stops a microphone stream that resolves after disconnect", async () => {
    const { track, stream, events, descriptor } = setup();
    let resolve!: (stream: MediaStream) => void;
    const microphone = mock(
      () =>
        new Promise<MediaStream>((r) => {
          resolve = r;
        }),
    );
    const request = mock(async () => Response.json({ success: true, data: descriptor }));
    const transport = new OpenAIVoiceTransport({
      fetch: request as unknown as typeof fetch,
      getUserMedia: microphone,
    });
    const connecting = transport.connect(events);
    while (!resolve) await Promise.resolve();
    transport.disconnect();
    resolve(stream as unknown as MediaStream);
    await connecting;
    expect(track.stop).toHaveBeenCalled();
  });
});
