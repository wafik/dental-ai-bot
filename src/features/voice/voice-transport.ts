export type VoiceTransportEvents = {
  onState: (state: "listening" | "speaking" | "connected") => void;
  onTranscript: (text: string, isUser: boolean) => void;
  onError: (error: Error) => void;
  onWarning: (error: Error) => void;
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
};

export type VoiceTransport = {
  connect(events: VoiceTransportEvents): Promise<void>;
  disconnect(): void;
  setMuted(muted: boolean): void;
};
