export type ChatTtsStatus = "loading" | "playing" | "blocked" | "error";

export type ChatTtsFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ChatTtsPlayerOptions = {
  fetchAudio?: ChatTtsFetch;
  createAudio?: (url: string) => HTMLAudioElement;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  onStatusChange?: (messageId: string, status: ChatTtsStatus | null) => void;
};

export class ChatTtsPlayer {
  private readonly fetchAudio: ChatTtsFetch;
  private readonly createAudio: (url: string) => HTMLAudioElement;
  private readonly createObjectUrl: (blob: Blob) => string;
  private readonly revokeObjectUrl: (url: string) => void;
  private readonly onStatusChange?: ChatTtsPlayerOptions["onStatusChange"];
  private controller: AbortController | null = null;
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private messageId: string | null = null;
  private requestId = 0;

  constructor(options: ChatTtsPlayerOptions = {}) {
    this.fetchAudio = options.fetchAudio ?? ((input, init) => fetch(input, init));
    this.createAudio = options.createAudio ?? ((url) => new Audio(url));
    this.createObjectUrl = options.createObjectUrl ?? ((blob) => URL.createObjectURL(blob));
    this.revokeObjectUrl = options.revokeObjectUrl ?? ((url) => URL.revokeObjectURL(url));
    this.onStatusChange = options.onStatusChange;
  }

  async play(messageId: string, text: string): Promise<void> {
    if (this.messageId === messageId && this.audio && this.objectUrl) {
      await this.playCurrentAudio(messageId);
      return;
    }

    if (this.messageId === messageId && this.controller) {
      return;
    }

    this.stop();
    const currentRequestId = ++this.requestId;
    const controller = new AbortController();
    this.controller = controller;
    this.messageId = messageId;
    this.onStatusChange?.(messageId, "loading");

    try {
      const response = await this.fetchAudio("/api/v1/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error("Speech request failed");
      }

      const blob = await response.blob();
      if (controller.signal.aborted || currentRequestId !== this.requestId) {
        return;
      }

      this.objectUrl = this.createObjectUrl(blob);
      this.audio = this.createAudio(this.objectUrl);
      this.audio.preload = "none";
      this.audio.onended = () => {
        if (this.messageId === messageId) {
          this.releaseAudio();
          this.onStatusChange?.(messageId, null);
        }
      };
      this.audio.onerror = () => {
        if (this.messageId === messageId) {
          this.releaseAudio();
          this.onStatusChange?.(messageId, "error");
        }
      };
      await this.playCurrentAudio(messageId);
    } catch {
      if (!controller.signal.aborted && currentRequestId === this.requestId) {
        this.controller = null;
        this.onStatusChange?.(messageId, "error");
      }
    }
  }

  stop(): void {
    this.requestId += 1;
    this.controller?.abort();
    this.controller = null;

    this.releaseAudio();
    if (this.messageId) {
      this.onStatusChange?.(this.messageId, null);
      this.messageId = null;
    }
  }

  private releaseAudio(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.removeAttribute("src");
      this.audio.load();
      this.audio = null;
    }
    if (this.objectUrl) {
      this.revokeObjectUrl(this.objectUrl);
      this.objectUrl = null;
    }
    this.controller = null;
  }

  private async playCurrentAudio(messageId: string): Promise<void> {
    if (!this.audio) {
      return;
    }
    const audio = this.audio;
    try {
      await audio.play();
      if (this.audio === audio) {
        this.onStatusChange?.(messageId, "playing");
      }
    } catch {
      if (this.audio === audio) {
        this.onStatusChange?.(messageId, "blocked");
      }
    }
  }
}
