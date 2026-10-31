import { TTSProviderError, type TTSProvider, type TTSAudio } from "./tts-provider";

export type TTSFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type KokoroTtsAdapterOptions = {
  baseUrl: string;
  voice: string;
  fetchImpl?: TTSFetch;
  timeoutMs?: number;
};

export class KokoroTtsAdapter implements TTSProvider {
  private readonly baseUrl: string;
  private readonly voice: string;
  private readonly fetchImpl: TTSFetch;
  private readonly timeoutMs: number;

  constructor(options: KokoroTtsAdapterOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.voice = options.voice;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.timeoutMs = Math.min(Math.max(options.timeoutMs ?? 20_000, 1), 60_000);
  }

  async synthesize({ text, signal }: { text: string; signal?: AbortSignal }): Promise<TTSAudio> {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    if (signal?.aborted) {
      controller.abort();
    } else {
      signal?.addEventListener("abort", abortFromCaller, { once: true });
    }
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/audio/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "kokoro",
          voice: this.voice,
          input: text,
          response_format: "mp3",
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new TTSProviderError("kokoro", "synthesize", response.status);
      }

      const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
      if (!contentType?.startsWith("audio/")) {
        throw new TTSProviderError("kokoro", "synthesize", response.status);
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length === 0) {
        throw new TTSProviderError("kokoro", "synthesize", response.status);
      }

      return { bytes, contentType };
    } catch (error) {
      if (error instanceof TTSProviderError) {
        throw error;
      }
      throw new TTSProviderError("kokoro", "synthesize");
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortFromCaller);
    }
  }
}
