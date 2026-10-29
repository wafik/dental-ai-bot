import type { VoiceTransport, VoiceTransportEvents } from "./voice-transport";

export type OpenAIVoiceTransportOptions = {
  createPeerConnection?: () => RTCPeerConnection;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  fetch?: typeof fetch;
  audioElement?: HTMLAudioElement;
  channelOpenTimeoutMs?: number;
  responseWaitTimeoutMs?: number;
};

export class OpenAIVoiceTransport implements VoiceTransport {
  private generation = 0;
  private muted = false;
  private controller: AbortController | null = null;
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private responseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: OpenAIVoiceTransportOptions = {}) {}

  async connect(events: VoiceTransportEvents): Promise<void> {
    const generation = ++this.generation;
    const active = () => generation === this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const request = this.options.fetch ?? fetch;
    const responseState = {
      active: false,
      pendingTools: 0,
      needsResponse: false,
      nextEventId: 0,
      pendingEventId: null as string | null,
      responseCompletedSinceRequest: false,
      responseRetries: 0,
      pendingToolEvents: new Set<string>(),
    };
    try {
      const response = await request("/api/v1/voice/session", {
        method: "POST",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Failed to fetch voice session: HTTP ${response.status}`);
      const payload = await response.json();
      const session = payload?.data;
      if (
        !payload?.success ||
        session?.provider !== "openai-realtime" ||
        typeof session.clientSecret !== "string" ||
        !session.clientSecret ||
        typeof session.sessionId !== "string" ||
        !session.sessionId ||
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
        for (const track of stream.getTracks()) {
          try {
            track.stop();
          } catch {
            /* Continue releasing other tracks. */
          }
        }
        return;
      }
      this.stream = stream;
      const peer = this.options.createPeerConnection?.() ?? new RTCPeerConnection();
      this.peer = peer;
      peer.onconnectionstatechange = () => {
        if (active() && ["failed", "closed"].includes(peer.connectionState)) {
          events.onError(new Error("Voice connection failed"));
        }
      };
      for (const track of stream.getAudioTracks()) {
        track.enabled = !this.muted;
        peer.addTrack(track, stream);
      }
      peer.ontrack = (event) => {
        if (!active() || !event.streams[0]) return;
        const audio = this.audio ?? this.options.audioElement ?? new Audio();
        this.audio = audio;
        audio.srcObject = event.streams[0];
        void audio.play().catch(() => {});
      };
      const channel = peer.createDataChannel("oai-events");
      this.channel = channel;
      let channelClosed = false;
      let rejectChannelWait: ((error: Error) => void) | null = null;
      channel.onclose = () => {
        channelClosed = true;
        const error = new Error("Voice channel closed");
        if (rejectChannelWait) rejectChannelWait(error);
        else if (active()) events.onError(error);
      };
      channel.onmessage = (event) => {
        if (!active() || typeof event.data !== "string") return;
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!message || typeof message !== "object" || Array.isArray(message)) return;
        void this.handleMessage(message, events, channel, active, responseState);
      };
      const offer = await peer.createOffer();
      if (!active()) return;
      await peer.setLocalDescription(offer);
      if (!active()) return;
      const query = new URLSearchParams({ model: session.model });
      const sdp = await request(`https://api.openai.com/v1/realtime?${query}`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${session.clientSecret}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp || "",
      });
      if (!sdp.ok) throw new Error(`OpenAI WebRTC SDP negotiation failed: HTTP ${sdp.status}`);
      const answer = await sdp.text();
      if (!active()) return;
      await peer.setRemoteDescription({ type: "answer", sdp: answer });
      if (!active()) return;
      if (channel.readyState !== "open") {
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            clearTimeout(timeout);
            controller.signal.removeEventListener("abort", abort);
            channel.onopen = null;
            rejectChannelWait = null;
          };
          const fail = (error: Error) => {
            cleanup();
            reject(error);
          };
          const abort = () => fail(new Error("Voice connection cancelled"));
          const opened = () => {
            cleanup();
            resolve();
          };
          const timeout = setTimeout(
            () => fail(new Error("Voice channel connection timed out")),
            this.options.channelOpenTimeoutMs ?? 15_000,
          );
          rejectChannelWait = fail;
          controller.signal.addEventListener("abort", abort, { once: true });
          channel.onopen = opened;
          if (controller.signal.aborted) abort();
          else if (channelClosed || channel.readyState === "closed")
            fail(new Error("Voice channel closed"));
          else if (channel.readyState === "open") opened();
        });
      }
      if (active()) events.onState("connected");
    } catch (error) {
      if (!active()) return;
      this.disconnect();
      throw error;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    for (const track of this.stream?.getAudioTracks() ?? []) track.enabled = !muted;
  }

  disconnect(): void {
    ++this.generation;
    if (this.responseTimer) clearTimeout(this.responseTimer);
    this.responseTimer = null;
    this.controller?.abort();
    this.controller = null;
    if (this.channel) {
      this.channel.onmessage = null;
      this.channel.onclose = null;
      this.channel.onopen = null;
      try {
        this.channel.close();
      } catch {
        /* Continue releasing other resources. */
      }
      this.channel = null;
    }
    if (this.peer) {
      this.peer.ontrack = null;
      this.peer.onconnectionstatechange = null;
      try {
        this.peer.close();
      } catch {
        /* Continue releasing other resources. */
      }
      this.peer = null;
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        try {
          track.stop();
        } catch {
          /* Continue releasing other tracks. */
        }
      }
      this.stream = null;
    }
    if (this.audio) {
      try {
        this.audio.pause();
      } catch {
        /* Detach the stream even if playback fails. */
      }
      this.audio.srcObject = null;
      this.audio = null;
    }
  }

  private async handleMessage(
    message: Record<string, unknown>,
    events: VoiceTransportEvents,
    channel: RTCDataChannel,
    active: () => boolean,
    responseState: {
      active: boolean;
      pendingTools: number;
      needsResponse: boolean;
      nextEventId: number;
      pendingEventId: string | null;
      responseCompletedSinceRequest: boolean;
      responseRetries: number;
      pendingToolEvents: Set<string>;
    },
  ): Promise<void> {
    const createResponse = () => {
      if (
        !active() ||
        channel.readyState !== "open" ||
        responseState.active ||
        responseState.pendingEventId ||
        responseState.pendingTools ||
        !responseState.needsResponse
      )
        return;
      try {
        const eventId = `voice-response-${++responseState.nextEventId}`;
        channel.send(
          JSON.stringify({
            type: "response.create",
            event_id: eventId,
            response: { metadata: { voice_event_id: eventId } },
          }),
        );
        responseState.pendingEventId = eventId;
        responseState.responseCompletedSinceRequest = false;
        responseState.active = true;
        responseState.needsResponse = false;
      } catch {
        if (active()) events.onError(new Error("Voice transport could not request response"));
      }
    };
    if (message.type === "response.created") {
      responseState.active = true;
    } else if (message.type === "error") {
      const error = message.error;
      const eventId =
        error && typeof error === "object" && "event_id" in error ? error.event_id : undefined;
      if (typeof eventId === "string" && responseState.pendingToolEvents.has(eventId)) {
        responseState.pendingToolEvents.delete(eventId);
        events.onError(new Error("Voice provider rejected a tool result"));
      } else if (eventId && eventId === responseState.pendingEventId) {
        responseState.pendingEventId = null;
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "conversation_already_has_active_response"
        ) {
          if (++responseState.responseRetries > 3) {
            events.onError(new Error("Voice provider could not start a response"));
          } else {
            responseState.active = !responseState.responseCompletedSinceRequest;
            responseState.needsResponse = true;
            if (responseState.active) {
              this.responseTimer = setTimeout(() => {
                this.responseTimer = null;
                if (active()) events.onError(new Error("Voice provider response timed out"));
              }, this.options.responseWaitTimeoutMs ?? 30_000);
            }
            createResponse();
          }
        } else {
          events.onError(new Error("Voice provider rejected a response"));
        }
      } else {
        events.onWarning(new Error("Voice provider reported an error"));
      }
    } else if (message.type === "conversation.item.created") {
      const item = message.item;
      if (item && typeof item === "object" && "id" in item && typeof item.id === "string") {
        responseState.pendingToolEvents.delete(item.id);
      }
    } else if (message.type === "input_audio_buffer.speech_started") events.onState("listening");
    else if (
      message.type === "response.audio.delta" ||
      message.type === "response.audio_transcript.delta"
    ) {
      events.onState("speaking");
      if (message.type === "response.audio_transcript.delta" && typeof message.delta === "string") {
        events.onTranscript(message.delta, false);
      }
    } else if (message.type === "conversation.item.input_audio_transcription.completed") {
      if (typeof message.transcript === "string") events.onTranscript(message.transcript, true);
    } else if (message.type === "response.done") {
      if (this.responseTimer) clearTimeout(this.responseTimer);
      this.responseTimer = null;
      if (responseState.pendingEventId) responseState.responseCompletedSinceRequest = true;
      const response = message.response;
      if (
        response &&
        typeof response === "object" &&
        "metadata" in response &&
        response.metadata &&
        typeof response.metadata === "object" &&
        "voice_event_id" in response.metadata &&
        response.metadata.voice_event_id === responseState.pendingEventId
      ) {
        responseState.pendingEventId = null;
        responseState.responseRetries = 0;
      }
      responseState.active = false;
      if (
        response &&
        typeof response === "object" &&
        "status" in response &&
        response.status === "failed"
      ) {
        events.onWarning(new Error("Voice provider could not complete a response"));
      }
      events.onState("connected");
      createResponse();
    } else if (message.type === "response.function_call_arguments.done") {
      if (typeof message.call_id !== "string" || typeof message.name !== "string") return;
      responseState.pendingTools++;
      let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(typeof message.arguments === "string" ? message.arguments : "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed;
      } catch {
        /* Invalid arguments are rejected by the tool route. */
      }
      let result: unknown;
      try {
        result = await events.executeTool(message.name, args);
      } catch {
        result = { success: false, error: "Tool execution failed" };
      }
      if (!active() || channel.readyState !== "open") return;
      try {
        const eventId = `voice-tool-${++responseState.nextEventId}`;
        responseState.pendingToolEvents.add(eventId);
        channel.send(
          JSON.stringify({
            type: "conversation.item.create",
            event_id: eventId,
            item: {
              id: eventId,
              type: "function_call_output",
              call_id: message.call_id,
              output: typeof result === "string" ? result : JSON.stringify(result),
            },
          }),
        );
        responseState.pendingTools--;
        responseState.needsResponse = true;
        createResponse();
      } catch {
        if (active()) events.onError(new Error("Voice transport could not send tool result"));
      }
    }
  }
}
