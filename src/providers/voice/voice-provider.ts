export type VoiceProviderId = "gemini-live" | "openai-realtime";

export type VoiceSessionResponse = {
  provider: VoiceProviderId;
  sessionId: string;
  clientSecret: string;
  model: string;
  voice: string;
  expiresAt?: number;
};

export type VoiceProvider = {
  createSession(): Promise<VoiceSessionResponse>;
};

export class VoiceProviderError extends Error {
  readonly provider: string;
  readonly operation: string;
  readonly status?: number;

  constructor(provider: string, operation: string, message: string, status?: number) {
    super(`[${provider}:${operation}] ${message}`);
    this.name = "VoiceProviderError";
    this.provider = provider;
    this.operation = operation;
    this.status = status;
  }

  static sanitize(message: string): string {
    return message
      .replace(/Bearer\s+([A-Za-z0-9_\-.]+)/gi, "Bearer [REDACTED]")
      .replace(/sk-[A-Za-z0-9_\-.]+/gi, "[REDACTED]");
  }

  static fromRaw(
    provider: string,
    operation: string,
    rawMessage: string,
    status?: number,
  ): VoiceProviderError {
    return new VoiceProviderError(
      provider,
      operation,
      VoiceProviderError.sanitize(rawMessage),
      status,
    );
  }
}
