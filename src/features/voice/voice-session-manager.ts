export type VoiceSessionState =
  | "idle"
  | "connecting"
  | "connected"
  | "listening"
  | "speaking"
  | "disconnected"
  | "error";

export type SessionTokenPayload = {
  sessionId: string;
  clientSecret: string;
  model?: string;
};

export type VoiceSessionManagerOptions = {
  createPeerConnection?: () => RTCPeerConnection;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  fetchSessionToken?: () => Promise<SessionTokenPayload>;
  sendSdpOffer?: (sdp: string, clientSecret: string, model: string) => Promise<string>;
  executeTool?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  audioElement?: HTMLAudioElement;
};

export class VoiceSessionManager {
  private state: VoiceSessionState = "idle";
  private muted = false;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private mediaStream: MediaStream | null = null;
  private stateChangeListeners: Array<(state: VoiceSessionState) => void> = [];
  private errorListeners: Array<(error: Error) => void> = [];
  private transcriptListeners: Array<(text: string, isUser: boolean) => void> = [];

  constructor(private readonly options: VoiceSessionManagerOptions = {}) {}

  getState(): VoiceSessionState {
    return this.state;
  }

  isMuted(): boolean {
    return this.muted;
  }

  onStateChange(listener: (state: VoiceSessionState) => void): () => void {
    this.stateChangeListeners.push(listener);
    return () => {
      this.stateChangeListeners = this.stateChangeListeners.filter((l) => l !== listener);
    };
  }

  onError(listener: (error: Error) => void): () => void {
    this.errorListeners.push(listener);
    return () => {
      this.errorListeners = this.errorListeners.filter((l) => l !== listener);
    };
  }

  onTranscript(listener: (text: string, isUser: boolean) => void): () => void {
    this.transcriptListeners.push(listener);
    return () => {
      this.transcriptListeners = this.transcriptListeners.filter((l) => l !== listener);
    };
  }

  private setState(newState: VoiceSessionState): void {
    this.state = newState;
    for (const listener of this.stateChangeListeners) {
      try {
        listener(newState);
      } catch (e) {
        console.error("Error in state change listener", e);
      }
    }
  }

  private emitError(error: Error): void {
    this.setState("error");
    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch (e) {
        console.error("Error in error listener", e);
      }
    }
  }

  private emitTranscript(text: string, isUser: boolean): void {
    for (const listener of this.transcriptListeners) {
      try {
        listener(text, isUser);
      } catch (e) {
        console.error("Error in transcript listener", e);
      }
    }
  }

  async connect(): Promise<void> {
    if (this.state === "connecting" || this.state === "connected") {
      return;
    }

    this.setState("connecting");

    try {
      // 1. Fetch ephemeral session token from backend route handler
      const sessionData = await (this.options.fetchSessionToken
        ? this.options.fetchSessionToken()
        : this.defaultFetchSessionToken());

      const clientSecret = sessionData.clientSecret;
      const model = sessionData.model || "gpt-4o-realtime-preview-2024-12-17";

      // 2. Request microphone audio stream
      const stream = await (this.options.getUserMedia
        ? this.options.getUserMedia({ audio: true })
        : navigator.mediaDevices.getUserMedia({ audio: true }));
      this.mediaStream = stream;

      // 3. Create WebRTC PeerConnection
      const pc = this.options.createPeerConnection
        ? this.options.createPeerConnection()
        : new RTCPeerConnection();
      this.peerConnection = pc;

      // 4. Attach local microphone track to PeerConnection
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !this.muted;
        pc.addTrack(audioTrack, stream);
      }

      // 5. Setup remote audio player for incoming assistant voice
      pc.ontrack = (event) => {
        const remoteStream = event.streams[0];
        if (remoteStream) {
          if (this.options.audioElement) {
            this.options.audioElement.srcObject = remoteStream;
          } else if (typeof Audio !== "undefined") {
            const audio = new Audio();
            audio.srcObject = remoteStream;
            audio.play().catch((err) => console.warn("Remote audio autoplay blocked:", err));
          }
        }
      };

      // 6. Create WebRTC DataChannel for Realtime events
      const dc = pc.createDataChannel("oai-events");
      this.dataChannel = dc;

      dc.onmessage = async (event) => {
        try {
          const raw = typeof event.data === "string" ? event.data : "";
          if (!raw) return;
          const msg = JSON.parse(raw);
          await this.handleDataChannelMessage(msg);
        } catch (err: unknown) {
          console.error("Failed to parse DataChannel event", err);
        }
      };

      // 7. Create WebRTC Offer and set local description
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 8. Send SDP offer to OpenAI Realtime endpoint using ephemeral clientSecret
      const answerSdp = await (this.options.sendSdpOffer
        ? this.options.sendSdpOffer(offer.sdp || "", clientSecret, model)
        : this.defaultSendSdpOffer(offer.sdp || "", clientSecret, model));

      // 9. Set remote SDP answer to complete WebRTC handshake
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      this.setState("connected");
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emitError(error);
      this.disconnect();
      throw error;
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.mediaStream) {
      for (const track of this.mediaStream.getAudioTracks()) {
        track.enabled = !this.muted;
      }
    }
    return this.muted;
  }

  disconnect(): void {
    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch {
        // ignore
      }
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch {
        // ignore
      }
      this.peerConnection = null;
    }

    if (this.mediaStream) {
      for (const track of this.mediaStream.getAudioTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      this.mediaStream = null;
    }

    this.setState("disconnected");
  }

  private async handleDataChannelMessage(msg: Record<string, unknown>): Promise<void> {
    const type = msg.type as string;

    if (type === "input_audio_buffer.speech_started") {
      this.setState("listening");
    } else if (type === "response.audio.delta" || type === "response.audio_transcript.delta") {
      this.setState("speaking");
      if (typeof msg.delta === "string") {
        this.emitTranscript(msg.delta, false);
      }
    } else if (type === "response.done") {
      this.setState("connected");
    } else if (type === "response.function_call_arguments.done") {
      // Model initiated a tool call
      const callId = msg.call_id as string;
      const toolName = msg.name as string;
      const rawArgs = msg.arguments as string;

      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(rawArgs || "{}");
      } catch {
        parsedArgs = {};
      }

      let toolResult: unknown;
      try {
        toolResult = this.options.executeTool
          ? await this.options.executeTool(toolName, parsedArgs)
          : await this.defaultExecuteTool(toolName, parsedArgs);
      } catch (err: unknown) {
        toolResult = {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }

      this.sendDataChannelMessage({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult),
        },
      });

      this.sendDataChannelMessage({
        type: "response.create",
      });
    } else if (type === "error") {
      const errorMsg = (msg.error as any)?.message || "OpenAI Realtime error";
      this.emitError(new Error(errorMsg));
    }
  }

  private sendDataChannelMessage(payload: Record<string, unknown>): void {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      return;
    }
    this.dataChannel.send(JSON.stringify(payload));
  }

  private async defaultFetchSessionToken(): Promise<SessionTokenPayload> {
    const res = await fetch("/api/v1/voice/session", { method: "POST" });
    if (!res.ok) {
      throw new Error(`Failed to fetch voice session token: HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!data.success || !data.data?.clientSecret) {
      throw new Error(data.error || "Missing client secret from voice session API");
    }
    return {
      sessionId: data.data.sessionId,
      clientSecret: data.data.clientSecret,
      model: data.data.model,
    };
  }

  private async defaultSendSdpOffer(
    sdp: string,
    clientSecret: string,
    model: string,
  ): Promise<string> {
    const res = await fetch(`https://api.openai.com/v1/realtime?model=${model}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        "Content-Type": "application/sdp",
      },
      body: sdp,
    });

    if (!res.ok) {
      throw new Error(`OpenAI WebRTC SDP negotiation failed: HTTP ${res.status}`);
    }

    return res.text();
  }

  private async defaultExecuteTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const res = await fetch("/api/v1/voice/tools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolName, arguments: args }),
    });

    if (!res.ok) {
      throw new Error(`Tool execution API failed with HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.result;
  }
}
