import { GeminiLiveTransport, type GeminiLiveTransportOptions } from "./gemini-live-transport";
import {
  OpenAICompatibleTransport,
  type OpenAICompatibleTransportOptions,
} from "./openai-compatible-transport";
import type { VoiceTransport, VoiceTransportEvents } from "./voice-transport";

export type DefaultVoiceTransportOptions = GeminiLiveTransportOptions &
  OpenAICompatibleTransportOptions;

/**
 * Asks the server which provider is configured, then delegates to that
 * transport. A GET is used on purpose: minting a Gemini token is single-use, so
 * probing with the session POST would spend it.
 */
export class DefaultVoiceTransport implements VoiceTransport {
  private inner: VoiceTransport | null = null;

  constructor(private readonly options: DefaultVoiceTransportOptions = {}) {}

  async connect(events: VoiceTransportEvents): Promise<void> {
    const request = this.options.fetch ?? fetch;
    const response = await request("/api/v1/voice/session", { method: "GET" });
    if (!response.ok)
      throw new Error(`Failed to read voice configuration: HTTP ${response.status}`);

    const payload = await response.json();
    const provider = payload?.data?.provider;

    this.inner =
      provider === "openai-compatible"
        ? new OpenAICompatibleTransport(this.options)
        : new GeminiLiveTransport(this.options);

    await this.inner.connect(events);
  }

  setMuted(muted: boolean): void {
    this.inner?.setMuted(muted);
  }

  disconnect(): void {
    this.inner?.disconnect();
  }
}
