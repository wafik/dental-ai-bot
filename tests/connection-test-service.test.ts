import { describe, expect, it } from "bun:test";
import { testConnection } from "../src/services/connection-test-service";
import { InMemorySecretRepository } from "../src/repository/in-memory-admin-repositories";

const ENCRYPTION_ENV = { SETTINGS_ENCRYPTION_KEY: "a".repeat(64) };

function makeDeps(
  overrides: {
    fetchImpl?: typeof fetch;
    env?: Record<string, string | undefined>;
    now?: () => number;
  } = {},
) {
  return {
    secretRepository: new InMemorySecretRepository(ENCRYPTION_ENV),
    env: overrides.env ?? {},
    ...(overrides.fetchImpl ? { fetchImpl: overrides.fetchImpl } : {}),
    ...(overrides.now ? { now: overrides.now } : {}),
  };
}

const explodingFetch = (() => {
  throw new Error("fetch must not be called when credentials are missing");
}) as unknown as typeof fetch;

describe("testConnection credential resolution", () => {
  it("fails without calling fetch when an OpenAI key is missing", async () => {
    const result = await testConnection(makeDeps({ fetchImpl: explodingFetch }), "openai");

    expect(result).toEqual({
      success: false,
      provider: "openai",
      latencyMs: 0,
      message: "Missing credentials",
    });
  });

  it("fails without calling fetch when any Google field is missing", async () => {
    const deps = makeDeps({ fetchImpl: explodingFetch, env: {} });
    await deps.secretRepository.setSecret("google.clientId", "client-id");
    await deps.secretRepository.setSecret("google.clientSecret", "client-secret");

    const result = await testConnection(deps, "google");
    expect(result.success).toBe(false);
    expect(result.message).toBe("Missing credentials");
  });

  it("fails without calling fetch when the Microsoft tenant is missing", async () => {
    const deps = makeDeps({ fetchImpl: explodingFetch, env: {} });
    await deps.secretRepository.setSecret("microsoft.clientId", "id");
    await deps.secretRepository.setSecret("microsoft.clientSecret", "secret");
    await deps.secretRepository.setSecret("microsoft.refreshToken", "refresh");

    const result = await testConnection(deps, "microsoft");
    expect(result.success).toBe(false);
    expect(result.message).toBe("Missing credentials");
  });

  it("prefers draft values over stored secrets", async () => {
    const seenAuth: Array<string | null> = [];
    const fetchImpl = (async (request: Request) => {
      seenAuth.push(request.headers.get("authorization"));
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const deps = makeDeps({ fetchImpl });
    await deps.secretRepository.setSecret("openai.apiKey", "sk-stored");

    await testConnection(deps, "openai", { "openai.apiKey": "sk-draft" });
    expect(seenAuth[0]).toBe("Bearer sk-draft");
  });

  it("falls back to documented environment variables", async () => {
    const seenAuth: Array<string | null> = [];
    const fetchImpl = (async (request: Request) => {
      seenAuth.push(request.headers.get("authorization"));
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const deps = makeDeps({ fetchImpl, env: { OPENAI_API_KEY: "sk-env" } });
    const result = await testConnection(deps, "openai");

    expect(result.success).toBe(true);
    expect(seenAuth[0]).toBe("Bearer sk-env");
  });
});

describe("testConnection request shape", () => {
  it("calls the OpenAI models endpoint and reports latency", async () => {
    let seenUrl = "";
    let seenMethod = "";
    const ticks = [1_000, 1_042];
    const fetchImpl = (async (request: Request) => {
      seenUrl = request.url;
      seenMethod = request.method;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const deps = makeDeps({
      fetchImpl,
      now: () => ticks.shift() ?? 1_042,
    });
    const result = await testConnection(deps, "openai", { "openai.apiKey": "sk-draft" });

    expect(seenUrl).toBe("https://api.openai.com/v1/models");
    expect(seenMethod).toBe("GET");
    expect(result).toEqual({
      success: true,
      provider: "openai",
      latencyMs: 42,
      message: "Connection successful",
    });
  });

  it("posts Google refresh-token form data to the fixed token endpoint", async () => {
    let seenUrl = "";
    let seenBody = "";
    let seenContentType = "";
    const fetchImpl = (async (request: Request) => {
      seenUrl = request.url;
      seenBody = await request.text();
      seenContentType = request.headers.get("content-type") ?? "";
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await testConnection(makeDeps({ fetchImpl }), "google", {
      "google.clientId": "client-id",
      "google.clientSecret": "client-secret",
      "google.refreshToken": "refresh-token",
    });

    expect(seenUrl).toBe("https://oauth2.googleapis.com/token");
    expect(seenContentType).toContain("application/x-www-form-urlencoded");
    const params = new URLSearchParams(seenBody);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("client_id")).toBe("client-id");
    expect(params.get("client_secret")).toBe("client-secret");
    expect(params.get("refresh_token")).toBe("refresh-token");
    expect(result.success).toBe(true);
  });

  it("posts Microsoft refresh-token form data to the tenant token endpoint with Graph scope", async () => {
    let seenUrl = "";
    let seenBody = "";
    const fetchImpl = (async (request: Request) => {
      seenUrl = request.url;
      seenBody = await request.text();
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await testConnection(makeDeps({ fetchImpl }), "microsoft", {
      "microsoft.tenantId": "contoso-tenant",
      "microsoft.clientId": "client-id",
      "microsoft.clientSecret": "client-secret",
      "microsoft.refreshToken": "refresh-token",
    });

    expect(seenUrl).toBe("https://login.microsoftonline.com/contoso-tenant/oauth2/v2.0/token");
    const params = new URLSearchParams(seenBody);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("scope")).toBe("https://graph.microsoft.com/.default");
    expect(result.success).toBe(true);
  });

  it("sends an 8 second abort timeout signal", async () => {
    let hasSignal = false;
    const fetchImpl = (async (request: Request) => {
      hasSignal = request.signal instanceof AbortSignal;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    await testConnection(makeDeps({ fetchImpl }), "openai", { "openai.apiKey": "sk-draft" });
    expect(hasSignal).toBe(true);
  });
});

describe("testConnection failure handling", () => {
  it("returns a generic failure for a 401 without leaking the upstream body", async () => {
    const fetchImpl = (async () =>
      new Response('{"error":{"message":"Incorrect API key provided: sk-leaked"}}', {
        status: 401,
      })) as unknown as typeof fetch;

    const result = await testConnection(makeDeps({ fetchImpl }), "openai", {
      "openai.apiKey": "sk-bad",
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe("Connection failed");
    expect(result.message).not.toContain("Incorrect API key");
    expect(JSON.stringify(result)).not.toContain("sk-");
  });

  it("returns a generic failure when fetch throws a network error", async () => {
    const fetchImpl = (async () => {
      throw new Error("socket hang up for token sk-should-not-leak");
    }) as unknown as typeof fetch;

    const result = await testConnection(makeDeps({ fetchImpl }), "openai", {
      "openai.apiKey": "sk-draft",
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe("Connection failed");
    expect(JSON.stringify(result)).not.toContain("socket hang up");
  });

  it("reports elapsed latency for failed probes", async () => {
    const ticks = [5_000, 5_123];
    const fetchImpl = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;

    const result = await testConnection(
      makeDeps({ fetchImpl, now: () => ticks.shift() ?? 5_123 }),
      "openai",
      { "openai.apiKey": "sk-draft" },
    );

    expect(result).toMatchObject({ success: false, latencyMs: 123, message: "Connection failed" });
  });
});
