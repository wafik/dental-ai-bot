import { createHash } from "node:crypto";

export const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const ADMIN_IDLE_TTL_MS = 30 * 60 * 1000;

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

type CookieEnv = Record<string, string | undefined>;

/**
 * Uses the __Host- prefix only over HTTPS; local development keeps a plain name.
 */
export function getAdminCookieName(env: CookieEnv = process.env): string {
  return env.APP_BASE_URL?.startsWith("https://") ? "__Host-admin_session" : "admin_session";
}

function secureAttribute(env: CookieEnv): string {
  return env.APP_BASE_URL?.startsWith("https://") ? " Secure;" : "";
}

export function buildSessionCookie(
  token: string,
  expiresAtMs: number,
  env: CookieEnv = process.env,
): string {
  const maxAge = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
  return `${getAdminCookieName(env)}=${token}; HttpOnly; SameSite=Strict; Path=/;${secureAttribute(env)} Max-Age=${maxAge}`;
}

export function buildClearSessionCookie(env: CookieEnv = process.env): string {
  return `${getAdminCookieName(env)}=; HttpOnly; SameSite=Strict; Path=/;${secureAttribute(env)} Max-Age=0`;
}

export function readSessionToken(request: Request, env: CookieEnv = process.env): string | null {
  const header = request.headers.get("cookie");
  if (!header) {
    return null;
  }

  const name = getAdminCookieName(env);
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) {
      return rest.join("=") || null;
    }
  }
  return null;
}
