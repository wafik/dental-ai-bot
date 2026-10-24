import { describe, expect, it, mock } from "bun:test";
import {
  VoiceSessionManager,
  type VoiceSessionState,
} from "../src/features/voice/voice-session-manager";

// Mock WebRTC DataChannel
class MockDataChannel {
  name: string;
  sentMessages: string[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  readyState = "open";

  constructor(name: string) {
    this.name = name;
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = "closed";
    if (this.onclose) this.onclose();
  }

  // Helper for test to simulate receiving an event from OpenAI
  simulateMessage(data: Record<string, unknown>) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }
}

// Mock WebRTC PeerConnection
class MockRTCPeerConnection {
  dataChannel: MockDataChannel | null = null;
  localDescription: { type: string; sdp: string } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  tracks: any[] = [];
  ontrack: ((event: any) => void) | null = null;
  connectionState = "new";

  createDataChannel(name: string) {
    this.dataChannel = new MockDataChannel(name);
    return this.dataChannel;
  }

  addTrack(track: any) {
    this.tracks.push(track);
  }

  async createOffer() {
    return { type: "offer", sdp: "v=0\r\no=mock-offer" };
  }

  async setLocalDescription(desc: any) {
    this.localDescription = desc;
  }

  async setRemoteDescription(desc: any) {
    this.remoteDescription = desc;
  }

  close() {
    this.connectionState = "closed";
    if (this.dataChannel) {
      this.dataChannel.close();
    }
  }
}

// Mock Audio Track & MediaStream
class MockMediaStreamTrack {
  enabled = true;
  stop = mock(() => {});
}

class MockMediaStream {
  tracks: MockMediaStreamTrack[] = [new MockMediaStreamTrack()];
  getAudioTracks() {
    return this.tracks;
  }
}

describe("VoiceSessionManager", () => {
  it("initializes in idle state", () => {
    const manager = new VoiceSessionManager();
    expect(manager.getState()).toBe("idle");
    expect(manager.isMuted()).toBe(false);
  });

  it("transitions states during connection and negotiates WebRTC SDP", async () => {
    const mockPc = new MockRTCPeerConnection();
    const mockStream = new MockMediaStream();

    const states: VoiceSessionState[] = [];
    const manager = new VoiceSessionManager({
      createPeerConnection: () => mockPc as any,
      getUserMedia: async () => mockStream as any,
      fetchSessionToken: async () => ({
        sessionId: "sess_123",
        clientSecret: "ek_token_abc",
        model: "gpt-4o-realtime-preview-2024-12-17",
      }),
      sendSdpOffer: async (sdp, secret) => {
        expect(secret).toBe("ek_token_abc");
        expect(sdp).toBe("v=0\r\no=mock-offer");
        return "v=0\r\no=mock-answer";
      },
    });

    manager.onStateChange((state) => states.push(state));

    await manager.connect();

    expect(states).toContain("connecting");
    expect(states).toContain("connected");
    expect(manager.getState()).toBe("connected");
    expect(mockPc.localDescription?.sdp).toBe("v=0\r\no=mock-offer");
    expect(mockPc.remoteDescription?.sdp).toBe("v=0\r\no=mock-answer");
  });

  it("handles incoming function call, executes tool handler, and returns output via DataChannel", async () => {
    const mockPc = new MockRTCPeerConnection();
    const mockStream = new MockMediaStream();
    const executedTools: Array<{ name: string; args: any }> = [];

    const manager = new VoiceSessionManager({
      createPeerConnection: () => mockPc as any,
      getUserMedia: async () => mockStream as any,
      fetchSessionToken: async () => ({
        sessionId: "sess_123",
        clientSecret: "ek_token_abc",
        model: "gpt-4o-realtime-preview-2024-12-17",
      }),
      sendSdpOffer: async () => "v=0\r\no=mock-answer",
      executeTool: async (toolName, toolArgs) => {
        executedTools.push({ name: toolName, args: toolArgs });
        return { success: true, message: "Appointment confirmed" };
      },
    });

    await manager.connect();

    const dataChannel = mockPc.dataChannel!;
    expect(dataChannel).not.toBeNull();

    // Simulate OpenAI Realtime calling check_availability
    dataChannel.simulateMessage({
      type: "response.function_call_arguments.done",
      call_id: "call_abc123",
      name: "check_availability",
      arguments: JSON.stringify({ serviceCode: "A", date: "2026-10-28" }),
    });

    // Wait microtask tick for async tool execution
    await new Promise((r) => setTimeout(r, 10));

    expect(executedTools).toHaveLength(1);
    expect(executedTools[0]?.name).toBe("check_availability");
    expect(executedTools[0]?.args.serviceCode).toBe("A");

    // Verify DataChannel sent item.create and response.create
    expect(dataChannel.sentMessages.length).toBe(2);

    const itemCreate = JSON.parse(dataChannel.sentMessages[0]!);
    expect(itemCreate.type).toBe("conversation.item.create");
    expect(itemCreate.item.type).toBe("function_call_output");
    expect(itemCreate.item.call_id).toBe("call_abc123");
    expect(JSON.parse(itemCreate.item.output).message).toBe("Appointment confirmed");

    const responseCreate = JSON.parse(dataChannel.sentMessages[1]!);
    expect(responseCreate.type).toBe("response.create");
  });

  it("toggles microphone mute state", async () => {
    const mockPc = new MockRTCPeerConnection();
    const mockStream = new MockMediaStream();

    const manager = new VoiceSessionManager({
      createPeerConnection: () => mockPc as any,
      getUserMedia: async () => mockStream as any,
      fetchSessionToken: async () => ({
        sessionId: "sess_1",
        clientSecret: "ek_1",
        model: "gpt-4o-realtime",
      }),
      sendSdpOffer: async () => "answer",
    });

    await manager.connect();

    const track = mockStream.tracks[0]!;
    expect(track.enabled).toBe(true);

    manager.toggleMute();
    expect(track.enabled).toBe(false);
    expect(manager.isMuted()).toBe(true);

    manager.toggleMute();
    expect(track.enabled).toBe(true);
    expect(manager.isMuted()).toBe(false);
  });

  it("disconnects and disposes all tracks and peer connections cleanly", async () => {
    const mockPc = new MockRTCPeerConnection();
    const mockStream = new MockMediaStream();

    const manager = new VoiceSessionManager({
      createPeerConnection: () => mockPc as any,
      getUserMedia: async () => mockStream as any,
      fetchSessionToken: async () => ({
        sessionId: "sess_1",
        clientSecret: "ek_1",
        model: "gpt-4o-realtime",
      }),
      sendSdpOffer: async () => "answer",
    });

    await manager.connect();
    expect(manager.getState()).toBe("connected");

    manager.disconnect();
    expect(manager.getState()).toBe("disconnected");
    expect(mockPc.connectionState).toBe("closed");
    expect(mockStream.tracks[0]?.stop).toHaveBeenCalled();
  });
});
