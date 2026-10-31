import type { SecretRepository } from "../repository/secret-repository";
import { buildServiceAccountAssertion } from "../providers/calendar/google-calendar-adapter";
import { ALL_SECRET_KEYS, ENV_FALLBACK_KEYS, type SecretKey } from "../security/secret-keys";

export type ConnectionProvider = "openai" | "google" | "microsoft";

export type ConnectionTestResult = {
  success: boolean;
  provider: ConnectionProvider;
  latencyMs: number;
  message: string;
};

export type ConnectionTestDeps = {
  secretRepository: SecretRepository;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

const REQUEST_TIMEOUT_MS = 8_000;
const MICROSOFT_SCOPE = "https://graph.microsoft.com/.default";

const PROVIDER_KEYS: Record<ConnectionProvider, SecretKey[]> = {
  openai: ["openai.apiKey"],
  google: ["google.clientId", "google.clientSecret", "google.refreshToken"],
  microsoft: [
    "microsoft.tenantId",
    "microsoft.clientId",
    "microsoft.clientSecret",
    "microsoft.refreshToken",
  ],
};

const GOOGLE_SERVICE_ACCOUNT_KEYS: SecretKey[] = [
  "google.serviceAccountEmail",
  "google.serviceAccountPrivateKey",
];

const SECRET_KEY_SET = new Set<string>(ALL_SECRET_KEYS);

function draftValue(draft: Record<string, string> | undefined, key: string): string | null {
  if (!draft || !Object.prototype.hasOwnProperty.call(draft, key)) {
    return null;
  }
  const value = draft[key]?.trim();
  return value ? value : null;
}

/**
 * Resolves a credential with draft > stored secret > environment precedence.
 * Only documented secret keys can read an environment fallback.
 */
async function resolveField(
  deps: ConnectionTestDeps,
  env: Record<string, string | undefined>,
  key: SecretKey,
  draft: Record<string, string> | undefined,
): Promise<string | null> {
  const typed = draftValue(draft, key);
  if (typed) {
    return typed;
  }

  if (SECRET_KEY_SET.has(key)) {
    const stored = await deps.secretRepository.getSecret(key);
    if (stored?.trim()) {
      return stored.trim();
    }
  }

  const fallbackName = ENV_FALLBACK_KEYS[key];
  const fallbackValue = fallbackName ? env[fallbackName]?.trim() : undefined;
  return fallbackValue ? fallbackValue : null;
}

/** Resolves every key, or returns null when any one of them is unset. */
async function resolveFields(
  deps: ConnectionTestDeps,
  env: Record<string, string | undefined>,
  keys: SecretKey[],
  draft: Record<string, string> | undefined,
): Promise<Record<string, string> | null> {
  const fields: Record<string, string> = {};
  for (const key of keys) {
    const value = await resolveField(deps, env, key, draft);
    if (!value) {
      return null;
    }
    fields[key] = value;
  }
  return fields;
}

async function buildRequest(
  provider: ConnectionProvider,
  fields: Record<string, string>,
  googleServiceAccount?: Record<string, string>,
): Promise<Request> {
  if (provider === "openai") {
    return new Request("https://api.openai.com/v1/models", {
      method: "GET",
      headers: { Authorization: `Bearer ${fields["openai.apiKey"]!}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  if (provider === "google") {
    if (googleServiceAccount) {
      const assertion = buildServiceAccountAssertion(
        googleServiceAccount["google.serviceAccountEmail"]!,
        googleServiceAccount["google.serviceAccountPrivateKey"]!,
      );
      return new Request("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion,
        }).toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: fields["google.clientId"]!,
      client_secret: fields["google.clientSecret"]!,
      refresh_token: fields["google.refreshToken"]!,
    });

    return new Request("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  const tenantId = encodeURIComponent(fields["microsoft.tenantId"]!);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: fields["microsoft.clientId"]!,
    client_secret: fields["microsoft.clientSecret"]!,
    refresh_token: fields["microsoft.refreshToken"]!,
    scope: MICROSOFT_SCOPE,
  });

  return new Request(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/**
 * Probes a fixed provider endpoint with a bounded timeout. Draft values are
 * never persisted, and responses never leak provider bodies or credentials.
 */
export async function testConnection(
  deps: ConnectionTestDeps,
  provider: ConnectionProvider,
  draft?: Record<string, string>,
): Promise<ConnectionTestResult> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? Date.now;

  if (!Object.prototype.hasOwnProperty.call(PROVIDER_KEYS, provider)) {
    // Defensive: callers validate the enum, so only an internal bug reaches this.
    return { success: false, provider, latencyMs: 0, message: "Missing credentials" };
  }

  // Google accepts either auth mode; a complete service account wins, the
  // same precedence the calendar factory applies at booking time.
  let googleServiceAccount: Record<string, string> | null = null;
  let fields: Record<string, string> | null;
  if (provider === "google") {
    googleServiceAccount = await resolveFields(deps, env, GOOGLE_SERVICE_ACCOUNT_KEYS, draft);
    fields = googleServiceAccount
      ? {}
      : await resolveFields(deps, env, PROVIDER_KEYS[provider], draft);
  } else {
    fields = await resolveFields(deps, env, PROVIDER_KEYS[provider], draft);
  }

  if (!fields) {
    return { success: false, provider, latencyMs: 0, message: "Missing credentials" };
  }

  const startedAt = now();
  try {
    const request = await buildRequest(provider, fields, googleServiceAccount ?? undefined);
    const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
    const response = await fetchImpl(request);
    // Do not read the body: provider error payloads must never reach clients.

    return {
      success: response.ok,
      provider,
      latencyMs: Math.max(0, now() - startedAt),
      message: response.ok ? "Connection successful" : "Connection failed",
    };
  } catch {
    return {
      success: false,
      provider,
      latencyMs: Math.max(0, now() - startedAt),
      message: "Connection failed",
    };
  }
}
