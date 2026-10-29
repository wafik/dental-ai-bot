import { NextResponse } from "next/server";
import { getTTSConfig } from "@/config/tts";
import { SlidingWindowRateLimiter } from "@/safety/rate-limiter";
import { KokoroTtsAdapter } from "@/providers/tts/kokoro-tts-adapter";
import { TTSProviderError, type TTSProvider } from "@/providers/tts/tts-provider";

const MAX_BODY_BYTES = 16 * 1024;
const MAX_TEXT_LENGTH = 4000;
const defaultLimiter = new SlidingWindowRateLimiter({ maxRequests: 20, windowMs: 60_000 });

export type TTSRouteDeps = {
  provider?: TTSProvider;
  rateLimiter?: SlidingWindowRateLimiter;
  env?: Record<string, string | undefined>;
};

function jsonError(error: string, status: number): Response {
  return NextResponse.json({ success: false, error }, { status });
}

async function readBoundedBody(request: Request): Promise<string | null> {
  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const body = new Uint8Array(MAX_BODY_BYTES);
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (byteLength + value.byteLength > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    body.set(value, byteLength);
    byteLength += value.byteLength;
  }

  return new TextDecoder().decode(body.subarray(0, byteLength));
}

export function createTTSHandler(deps: TTSRouteDeps = {}) {
  const limiter = deps.rateLimiter ?? defaultLimiter;

  return async function POST(request: Request): Promise<Response> {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return jsonError("Request body is too large.", 413);
    }

    let rawBody: string | null;
    try {
      rawBody = await readBoundedBody(request);
    } catch {
      return jsonError("Invalid request body.", 400);
    }
    if (rawBody === null) {
      return jsonError("Request body is too large.", 413);
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonError("Invalid request body.", 400);
    }

    const text =
      typeof body === "object" && body !== null && "text" in body && typeof body.text === "string"
        ? body.text.trim()
        : "";
    if (
      !text ||
      text.length > MAX_TEXT_LENGTH ||
      new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES
    ) {
      return jsonError("Text must contain between 1 and 4000 characters.", 400);
    }

    if (!limiter.check("tts-global").allowed) {
      return jsonError("Too many speech requests. Please wait before trying again.", 429);
    }

    try {
      const provider = deps.provider ?? new KokoroTtsAdapter(getTTSConfig(deps.env));
      const audio = await provider.synthesize({ text, signal: request.signal });
      if (!audio.contentType.toLowerCase().startsWith("audio/")) {
        return jsonError("Text-to-speech is temporarily unavailable.", 502);
      }
      return new Response(Uint8Array.from(audio.bytes).buffer, {
        status: 200,
        headers: {
          "Content-Type": audio.contentType,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      if (error instanceof TTSProviderError && error.operation === "configuration") {
        return jsonError("Text-to-speech is not configured.", 503);
      }
      return jsonError("Text-to-speech is temporarily unavailable.", 502);
    }
  };
}

export const POST = createTTSHandler();
