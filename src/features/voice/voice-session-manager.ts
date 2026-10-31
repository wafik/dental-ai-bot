import type { VoiceTransport } from "./voice-transport";

export type VoiceSessionState =
  | "idle"
  | "connecting"
  | "connected"
  | "listening"
  | "speaking"
  | "disconnected"
  | "error";

export type VoiceSessionManagerOptions = {
  transport: VoiceTransport;
  executeTool?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
};

export class VoiceSessionManager {
  private state: VoiceSessionState = "idle";
  private muted = false;
  private generation = 0;
  private stateChangeListeners: Array<(state: VoiceSessionState) => void> = [];
  private errorListeners: Array<(error: Error) => void> = [];
  private transcriptListeners: Array<(text: string, isUser: boolean) => void> = [];

  constructor(private readonly options: VoiceSessionManagerOptions) {}

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

  private setState(state: VoiceSessionState): void {
    this.state = state;
    for (const listener of this.stateChangeListeners) {
      try {
        listener(state);
      } catch (error) {
        console.error("Error in state change listener", error);
      }
    }
  }

  async connect(): Promise<void> {
    if (["connecting", "connected", "listening", "speaking"].includes(this.state)) return;
    const generation = ++this.generation;
    const active = () => this.generation === generation;
    this.setState("connecting");
    try {
      this.options.transport.setMuted(this.muted);
      await this.options.transport.connect({
        onState: (state) => {
          if (active()) this.setState(state);
        },
        onTranscript: (text, isUser) => {
          if (active())
            for (const listener of this.transcriptListeners) {
              try {
                listener(text, isUser);
              } catch (error) {
                console.error("Error in transcript listener", error);
              }
            }
        },
        onError: (error) => {
          if (!active()) return;
          ++this.generation;
          this.options.transport.disconnect();
          this.setState("error");
          for (const listener of this.errorListeners) {
            try {
              listener(error);
            } catch (err) {
              console.error("Error in error listener", err);
            }
          }
        },
        onWarning: (error) => {
          if (!active()) return;
          for (const listener of this.errorListeners) {
            try {
              listener(error);
            } catch (err) {
              console.error("Error in error listener", err);
            }
          }
        },
        executeTool: (name, args) => {
          if (!active()) return Promise.reject(new Error("Voice session disconnected"));
          return (this.options.executeTool ?? this.defaultExecuteTool)(name, args);
        },
      });
      if (active() && this.state === "connecting") this.setState("connected");
    } catch (err: unknown) {
      if (!active()) return;
      const error = err instanceof Error ? err : new Error(String(err));
      ++this.generation;
      this.options.transport.disconnect();
      this.setState("error");
      for (const listener of this.errorListeners) {
        try {
          listener(error);
        } catch (listenerError) {
          console.error("Error in error listener", listenerError);
        }
      }
      throw error;
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.options.transport.setMuted(this.muted);
    return this.muted;
  }

  disconnect(): void {
    ++this.generation;
    this.options.transport.disconnect();
    this.muted = false;
    this.setState("disconnected");
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
    if (!res.ok) throw new Error(`Tool execution API failed with HTTP ${res.status}`);
    const data = await res.json();
    return data.result;
  }
}
