export type TTSAudio = {
  bytes: Uint8Array;
  contentType: string;
};

export type TTSProvider = {
  synthesize(request: { text: string; signal?: AbortSignal }): Promise<TTSAudio>;
};

export class TTSProviderError extends Error {
  readonly provider: string;
  readonly operation: string;
  readonly status?: number;

  constructor(provider: string, operation: string, status?: number) {
    super("Text-to-speech service is unavailable.");
    this.name = "TTSProviderError";
    this.provider = provider;
    this.operation = operation;
    this.status = status;
  }
}
