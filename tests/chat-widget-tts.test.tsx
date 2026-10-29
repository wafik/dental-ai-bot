import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatWidget } from "../src/components/chat-widget";
import { ChatTtsPlayer, type ChatTtsStatus } from "../src/features/tts/chat-tts-player";

class FakeAudio {
  playCalls = 0;
  paused = false;
  onended: (() => void) | null = null;
  src = "blob:tts";
  playResult: Promise<void> = Promise.resolve();

  async play() {
    this.playCalls += 1;
    return this.playResult;
  }

  pause() {
    this.paused = true;
  }

  removeAttribute() {
    this.src = "";
  }

  load() {}
}

describe("ChatWidget TTS controls", () => {
  it("starts with auto-read enabled and does not render an auto-play request for the greeting", () => {
    const markup = renderToStaticMarkup(createElement(ChatWidget));
    expect(markup).toContain("Auto-read on");
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("Hello! Welcome to BrightSmile Dental Clinic.");
    expect(markup).not.toContain("Read aloud");
    const inputMarkup = markup.match(/<input[^>]*>/)?.[0] ?? "";
    expect(inputMarkup).toContain('placeholder="Type your question or booking request..."');
    expect(inputMarkup).not.toMatch(/\sdisabled(?:="")?(?:\s|\/?>)/);
  });
});

describe("ChatTtsPlayer", () => {
  it("fetches a new reply and plays the returned audio", async () => {
    const audio = new FakeAudio();
    const statuses: Array<ChatTtsStatus | null> = [];
    let requestUrl = "";
    let requestBody = "";
    const player = new ChatTtsPlayer({
      fetchAudio: async (input, init) => {
        requestUrl = String(input);
        requestBody = String(init?.body);
        return new Response(new Blob([new Uint8Array([1, 2])]), {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        });
      },
      createAudio: () => audio as unknown as HTMLAudioElement,
      createObjectUrl: () => "blob:reply-1",
      revokeObjectUrl: () => {},
      onStatusChange: (_id, status) => statuses.push(status),
    });

    await player.play("reply-1", "Your appointment is confirmed.");
    expect(requestUrl).toBe("/api/v1/tts");
    expect(JSON.parse(requestBody)).toEqual({ text: "Your appointment is confirmed." });
    expect(audio.playCalls).toBe(1);
    expect(statuses).toContain("playing");
  });

  it("retains audio for user playback when autoplay is blocked", async () => {
    const audio = new FakeAudio();
    audio.playResult = Promise.reject(new Error("autoplay blocked"));
    const status: { value: ChatTtsStatus | null } = { value: null };
    let fetchCalls = 0;
    const player = new ChatTtsPlayer({
      fetchAudio: async () => {
        fetchCalls += 1;
        return new Response(new Uint8Array([1]), { headers: { "content-type": "audio/mpeg" } });
      },
      createAudio: () => audio as unknown as HTMLAudioElement,
      createObjectUrl: () => "blob:reply",
      revokeObjectUrl: () => {},
      onStatusChange: (_id, next) => {
        status.value = next;
      },
    });

    await player.play("reply", "Hello there.");
    expect(status.value).toBe("blocked");
    audio.playResult = Promise.resolve();
    await player.play("reply", "Hello there.");
    expect(audio.playCalls).toBe(2);
    expect(fetchCalls).toBe(1);
  });

  it("stops audio, revokes its URL, and aborts pending synthesis", async () => {
    const audio = new FakeAudio();
    let signal: AbortSignal | undefined;
    const revoked: string[] = [];
    const player = new ChatTtsPlayer({
      fetchAudio: async (_input, init) => {
        signal = init?.signal ?? undefined;
        return new Response(new Uint8Array([1]), { headers: { "content-type": "audio/mpeg" } });
      },
      createAudio: () => audio as unknown as HTMLAudioElement,
      createObjectUrl: () => "blob:reply",
      revokeObjectUrl: (url) => revoked.push(url),
    });

    await player.play("reply", "Hello.");
    player.stop();
    expect(audio.paused).toBe(true);
    expect(audio.src).toBe("");
    expect(revoked).toEqual(["blob:reply"]);
    expect(signal?.aborted).toBe(true);
  });

  it("keeps failures local and retries synthesis on another play", async () => {
    const audio = new FakeAudio();
    const statuses: Array<ChatTtsStatus | null> = [];
    let fetchCalls = 0;
    const player = new ChatTtsPlayer({
      fetchAudio: async () => {
        fetchCalls += 1;
        if (fetchCalls === 1) {
          throw new Error("private upstream details");
        }
        return new Response(new Uint8Array([1]), { headers: { "content-type": "audio/mpeg" } });
      },
      createAudio: () => audio as unknown as HTMLAudioElement,
      createObjectUrl: () => "blob:retry",
      revokeObjectUrl: () => {},
      onStatusChange: (_id, status) => statuses.push(status),
    });

    await player.play("reply", "Still visible chat text.");
    expect(statuses).toContain("error");
    await player.play("reply", "Still visible chat text.");
    expect(fetchCalls).toBe(2);
    expect(audio.playCalls).toBe(1);
  });
});
