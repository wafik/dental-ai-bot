import { describe, expect, it, mock } from "bun:test";
import { VoiceSessionManager } from "../src/features/voice/voice-session-manager";
import type { VoiceTransport, VoiceTransportEvents } from "../src/features/voice/voice-transport";

class FakeTransport implements VoiceTransport {
  events?: VoiceTransportEvents;
  muted = false;
  disconnect = mock(() => {});
  async connect(events: VoiceTransportEvents) {
    this.events = events;
  }
  setMuted(muted: boolean) {
    this.muted = muted;
  }
}

describe("VoiceSessionManager", () => {
  it("drives state, transcripts, tools and mute without vendor protocol", async () => {
    const transport = new FakeTransport();
    const executeTool = mock(async () => ({ success: true }));
    const manager = new VoiceSessionManager({ transport, executeTool });
    const states: string[] = [];
    const transcripts: string[] = [];
    manager.onStateChange((state) => states.push(state));
    manager.onTranscript((text) => transcripts.push(text));
    await manager.connect();
    transport.events!.onState("listening");
    transport.events!.onState("speaking");
    transport.events!.onTranscript("Hello", false);
    expect(states).toEqual(["connecting", "connected", "listening", "speaking"]);
    expect(transcripts).toEqual(["Hello"]);
    expect(await transport.events!.executeTool("check_availability", {})).toEqual({
      success: true,
    });
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(manager.toggleMute()).toBe(true);
    expect(transport.muted).toBe(true);
    manager.disconnect();
    transport.events!.onState("connected");
    expect(manager.getState()).toBe("disconnected");
    expect(transport.disconnect).toHaveBeenCalled();
  });

  it("ignores callbacks after a connection fails", async () => {
    let events!: VoiceTransportEvents;
    const transport: VoiceTransport = {
      connect: async (callbacks) => {
        events = callbacks;
        throw new Error("failed");
      },
      disconnect: mock(() => {}),
      setMuted: () => {},
    };
    const manager = new VoiceSessionManager({ transport });
    await expect(manager.connect()).rejects.toThrow("failed");
    events.onState("connected");
    expect(manager.getState()).toBe("error");
  });

  it("ignores a connection completion after disconnect", async () => {
    let resolve!: () => void;
    const transport: VoiceTransport = {
      connect: () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
      disconnect: mock(() => {}),
      setMuted: () => {},
    };
    const manager = new VoiceSessionManager({ transport });
    const connecting = manager.connect();
    manager.disconnect();
    resolve();
    await connecting;
    expect(manager.getState()).toBe("disconnected");
  });

  it("reports recoverable warnings without disconnecting", async () => {
    const transport = new FakeTransport();
    const manager = new VoiceSessionManager({ transport });
    const errors: string[] = [];
    manager.onError((error) => errors.push(error.message));
    await manager.connect();
    transport.events!.onWarning(new Error("provider warning"));
    expect(manager.getState()).toBe("connected");
    expect(transport.disconnect).not.toHaveBeenCalled();
    expect(errors).toEqual(["provider warning"]);
    manager.disconnect();
    transport.events!.onWarning(new Error("stale warning"));
    expect(errors).toEqual(["provider warning"]);
  });

  it("releases the transport on provider failure", async () => {
    const transport = new FakeTransport();
    const manager = new VoiceSessionManager({ transport });
    const errors: string[] = [];
    manager.onError((error) => errors.push(error.message));
    await manager.connect();
    transport.events!.onError(new Error("connection failed"));
    expect(manager.getState()).toBe("error");
    expect(transport.disconnect).toHaveBeenCalled();
    expect(errors).toEqual(["connection failed"]);
    transport.events!.onState("connected");
    expect(manager.getState()).toBe("error");
  });

  it("ignores events from a disconnected connection", async () => {
    const transport = new FakeTransport();
    const manager = new VoiceSessionManager({ transport });
    await manager.connect();
    const oldEvents = transport.events!;
    manager.disconnect();
    await manager.connect();
    oldEvents.onState("speaking");
    expect(manager.getState()).toBe("connected");
    await expect(oldEvents.executeTool("book", {})).rejects.toThrow("disconnected");
  });
});
