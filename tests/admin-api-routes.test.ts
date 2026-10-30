import { describe, expect, it } from "bun:test";
import { createAdminLoginHandler } from "../src/app/api/v1/admin/login/route";
import { createAdminLogoutHandler } from "../src/app/api/v1/admin/logout/route";
import { createAdminSessionHandler } from "../src/app/api/v1/admin/session/route";
import { createAdminSettingsHandlers } from "../src/app/api/v1/admin/settings/route";
import { createAdminTestConnectionHandler } from "../src/app/api/v1/admin/test-connection/route";
import { AdminAuthService } from "../src/services/admin-auth-service";
import {
  InMemoryAdminSessionRepository,
  InMemoryLoginAttemptRepository,
  InMemorySecretRepository,
} from "../src/repository/in-memory-admin-repositories";
import { InMemorySettingsRepository } from "../src/repository/in-memory-settings-repository";
import { hashAdminPassword } from "../src/security/password";

const PASSWORD = "correct horse battery staple";
const ADMIN_ENV = {
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD_HASH: hashAdminPassword(PASSWORD),
};
const ENCRYPTION_ENV = { SETTINGS_ENCRYPTION_KEY: "a".repeat(64) };
const BASE_URL = "http://localhost/api/v1/admin";

type Harness = Awaited<ReturnType<typeof createHarness>>;

async function createHarness() {
  const sessionRepository = new InMemoryAdminSessionRepository();
  const attemptRepository = new InMemoryLoginAttemptRepository();
  const authService = new AdminAuthService({
    sessionRepository,
    attemptRepository,
    env: ADMIN_ENV,
  });
  const settingsRepository = new InMemorySettingsRepository();
  const secretRepository = new InMemorySecretRepository(ENCRYPTION_ENV);

  const loginHandler = createAdminLoginHandler({ authService, env: ADMIN_ENV });
  const settingsHandlers = createAdminSettingsHandlers({
    authService,
    settingsRepository,
    secretRepository,
    env: ADMIN_ENV,
  });

  const login = await loginHandler(
    mutationRequest("/login", { username: "admin", password: PASSWORD }),
  );
  if (login.status !== 200) {
    throw new Error(`harness login failed with ${login.status}`);
  }
  const setCookie = login.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0]!;

  return {
    authService,
    settingsRepository,
    secretRepository,
    loginHandler,
    settingsHandlers,
    cookie,
  };
}

function mutationRequest(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "x-admin-action": "1",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function authorizedHeaders(harness: Harness): Record<string, string> {
  return { cookie: harness.cookie };
}

const validPayload = {
  calendarProvider: "both",
  dentistMappings: [
    {
      dentistId: "junior",
      googleCalendarId: "cal-junior",
      outlookCalendarId: "outlook-junior",
    },
    { dentistId: "senior-1", googleCalendarId: "cal-senior-1", outlookCalendarId: "" },
    { dentistId: "senior-2", googleCalendarId: "cal-senior-2", outlookCalendarId: "" },
  ],
};

describe("POST /api/v1/admin/login", () => {
  it("sets an HttpOnly SameSite=Strict session cookie on success", async () => {
    const harness = await createHarness();
    const response = await harness.loginHandler(
      mutationRequest("/login", { username: "admin", password: PASSWORD }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, username: "admin" });

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("admin_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
  });

  it("rejects a mutation without the admin action header before reading the body", async () => {
    const harness = await createHarness();
    const response = await harness.loginHandler(
      new Request(`${BASE_URL}/login`, {
        method: "POST",
        headers: { origin: "http://localhost", "content-type": "application/json" },
        body: JSON.stringify({ username: "admin", password: PASSWORD }),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("rejects a cross-origin login", async () => {
    const harness = await createHarness();
    const response = await harness.loginHandler(
      mutationRequest(
        "/login",
        { username: "admin", password: PASSWORD },
        { origin: "http://evil.example" },
      ),
    );

    expect(response.status).toBe(403);
  });

  it("returns a generic 401 for a wrong password", async () => {
    const harness = await createHarness();
    const response = await harness.loginHandler(
      mutationRequest("/login", { username: "admin", password: "wrong" }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Invalid username or password.",
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns a generic 400 for malformed JSON", async () => {
    const harness = await createHarness();
    const response = await harness.loginHandler(
      new Request(`${BASE_URL}/login`, {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "x-admin-action": "1",
          "content-type": "application/json",
        },
        body: "{not-json",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("throttles with 429 and Retry-After after ten failures", async () => {
    // Fresh service so earlier tests do not consume the failure budget.
    const authService = new AdminAuthService({
      sessionRepository: new InMemoryAdminSessionRepository(),
      attemptRepository: new InMemoryLoginAttemptRepository(),
      env: ADMIN_ENV,
    });
    const handler = createAdminLoginHandler({ authService, env: ADMIN_ENV });

    for (let index = 0; index < 10; index += 1) {
      const response = await handler(
        mutationRequest("/login", { username: "admin", password: "wrong" }),
      );
      expect(response.status).toBe(401);
    }

    const throttled = await handler(
      mutationRequest("/login", { username: "admin", password: PASSWORD }),
    );
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get("retry-after")).toBe("900");
    expect(await throttled.json()).toEqual({
      success: false,
      error: "Invalid username or password.",
    });
  });

  it("returns 503 when admin credentials are not configured", async () => {
    const authService = new AdminAuthService({
      sessionRepository: new InMemoryAdminSessionRepository(),
      attemptRepository: new InMemoryLoginAttemptRepository(),
      env: {},
    });
    const handler = createAdminLoginHandler({ authService, env: {} });

    const response = await handler(
      mutationRequest("/login", { username: "admin", password: "anything" }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      success: false,
      error: "Admin login is not configured.",
    });
  });
});

describe("GET /api/v1/admin/session", () => {
  it("reports unauthenticated without a cookie", async () => {
    const harness = await createHarness();
    const handler = createAdminSessionHandler({ authService: harness.authService, env: ADMIN_ENV });

    const response = await handler(new Request(`${BASE_URL}/session`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, authenticated: false });
  });

  it("reports the username for a valid session", async () => {
    const harness = await createHarness();
    const handler = createAdminSessionHandler({ authService: harness.authService, env: ADMIN_ENV });

    const response = await handler(
      new Request(`${BASE_URL}/session`, { headers: authorizedHeaders(harness) }),
    );
    expect(await response.json()).toEqual({
      success: true,
      authenticated: true,
      username: "admin",
    });
  });
});

describe("POST /api/v1/admin/logout", () => {
  it("revokes the session and clears the cookie", async () => {
    const harness = await createHarness();
    const logout = createAdminLogoutHandler({ authService: harness.authService, env: ADMIN_ENV });

    const response = await logout(
      new Request(`${BASE_URL}/logout`, {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "x-admin-action": "1",
          ...authorizedHeaders(harness),
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");

    const session = createAdminSessionHandler({ authService: harness.authService, env: ADMIN_ENV });
    const after = await session(
      new Request(`${BASE_URL}/session`, { headers: authorizedHeaders(harness) }),
    );
    expect(await after.json()).toEqual({ success: true, authenticated: false });
  });
});

describe("GET /api/v1/admin/settings", () => {
  it("returns 401 without a session cookie", async () => {
    const harness = await createHarness();
    const response = await harness.settingsHandlers.GET(new Request(`${BASE_URL}/settings`));

    expect(response.status).toBe(401);
  });

  it("returns provider defaults and secret metadata only", async () => {
    const harness = await createHarness();
    await harness.secretRepository.setSecret("openai.apiKey", "sk-super-secret");

    const response = await harness.settingsHandlers.GET(
      new Request(`${BASE_URL}/settings`, { headers: authorizedHeaders(harness) }),
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("sk-super-secret");

    const json = JSON.parse(text);
    expect(json.success).toBe(true);
    expect(json.settings.calendarProvider).toBe("both");
    expect(json.settings.dentistMappings).toHaveLength(3);
    expect(json.settings.secrets["openai.apiKey"].isConfigured).toBe(true);
  });
});

describe("PUT /api/v1/admin/settings", () => {
  it("returns 403 without the admin action header even when authenticated", async () => {
    const harness = await createHarness();
    const response = await harness.settingsHandlers.PUT(
      new Request(`${BASE_URL}/settings`, {
        method: "PUT",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
          ...authorizedHeaders(harness),
        },
        body: JSON.stringify(validPayload),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("returns 403 for a wrong origin", async () => {
    const harness = await createHarness();
    const response = await harness.settingsHandlers.PUT(
      new Request(`${BASE_URL}/settings`, {
        method: "PUT",
        headers: {
          origin: "http://evil.example",
          "x-admin-action": "1",
          "content-type": "application/json",
          ...authorizedHeaders(harness),
        },
        body: JSON.stringify(validPayload),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("returns 401 without a session cookie", async () => {
    const harness = await createHarness();
    const response = await harness.settingsHandlers.PUT(
      new Request(`${BASE_URL}/settings`, {
        method: "PUT",
        headers: {
          origin: "http://localhost",
          "x-admin-action": "1",
          "content-type": "application/json",
        },
        body: JSON.stringify(validPayload),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("round-trips provider, mappings, and a secret without returning plaintext", async () => {
    const harness = await createHarness();
    const payload = { ...validPayload, secrets: { "openai.apiKey": "sk-super-secret" } };

    const response = await harness.settingsHandlers.PUT(
      new Request(`${BASE_URL}/settings`, {
        method: "PUT",
        headers: {
          origin: "http://localhost",
          "x-admin-action": "1",
          "content-type": "application/json",
          ...authorizedHeaders(harness),
        },
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("sk-super-secret");

    const json = JSON.parse(text);
    expect(json.settings.calendarProvider).toBe("both");
    expect(json.settings.dentistMappings[0]).toMatchObject({
      dentistId: "junior",
      googleCalendarId: "cal-junior",
      outlookCalendarId: "outlook-junior",
    });
    expect(json.settings.secrets["openai.apiKey"].isConfigured).toBe(true);
    expect(await harness.secretRepository.getSecret("openai.apiKey")).toBe("sk-super-secret");
  });

  it("rejects an invalid payload with 400", async () => {
    const harness = await createHarness();
    const response = await harness.settingsHandlers.PUT(
      new Request(`${BASE_URL}/settings`, {
        method: "PUT",
        headers: {
          origin: "http://localhost",
          "x-admin-action": "1",
          "content-type": "application/json",
          ...authorizedHeaders(harness),
        },
        body: JSON.stringify({
          calendarProvider: "icloud",
          dentistMappings: [],
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("clears a mapping when the calendar ID is blank", async () => {
    const harness = await createHarness();
    const response = await harness.settingsHandlers.PUT(
      new Request(`${BASE_URL}/settings`, {
        method: "PUT",
        headers: {
          origin: "http://localhost",
          "x-admin-action": "1",
          "content-type": "application/json",
          ...authorizedHeaders(harness),
        },
        body: JSON.stringify({
          calendarProvider: "both",
          dentistMappings: [
            { dentistId: "junior", googleCalendarId: "   ", outlookCalendarId: "" },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.settings.dentistMappings[0].googleCalendarId).toBe("");
  });
});

describe("POST /api/v1/admin/test-connection", () => {
  it("returns 403 without the admin action header", async () => {
    const harness = await createHarness();
    const handler = createAdminTestConnectionHandler({
      authService: harness.authService,
      secretRepository: harness.secretRepository,
      env: ADMIN_ENV,
    });

    const response = await handler(
      new Request(`${BASE_URL}/test-connection`, {
        method: "POST",
        headers: { origin: "http://localhost", "content-type": "application/json" },
        body: JSON.stringify({ provider: "openai" }),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("returns 401 without a session cookie", async () => {
    const harness = await createHarness();
    const handler = createAdminTestConnectionHandler({
      authService: harness.authService,
      secretRepository: harness.secretRepository,
      env: ADMIN_ENV,
    });

    const response = await handler(
      new Request(`${BASE_URL}/test-connection`, {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "x-admin-action": "1",
          "content-type": "application/json",
        },
        body: JSON.stringify({ provider: "openai" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("returns HTTP 200 with an unsuccessful result when credentials are missing", async () => {
    const harness = await createHarness();
    const handler = createAdminTestConnectionHandler({
      authService: harness.authService,
      secretRepository: harness.secretRepository,
      env: ADMIN_ENV,
      fetchImpl: (() => {
        throw new Error("fetch must not be called");
      }) as unknown as typeof fetch,
    });

    const response = await handler(
      new Request(`${BASE_URL}/test-connection`, {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "x-admin-action": "1",
          "content-type": "application/json",
          ...authorizedHeaders(harness),
        },
        body: JSON.stringify({ provider: "openai" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      result: {
        success: false,
        provider: "openai",
        latencyMs: 0,
        message: "Missing credentials",
      },
    });
  });

  it("rejects an unsupported provider with 400", async () => {
    const harness = await createHarness();
    const handler = createAdminTestConnectionHandler({
      authService: harness.authService,
      secretRepository: harness.secretRepository,
      env: ADMIN_ENV,
    });

    const response = await handler(
      new Request(`${BASE_URL}/test-connection`, {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "x-admin-action": "1",
          "content-type": "application/json",
          ...authorizedHeaders(harness),
        },
        body: JSON.stringify({ provider: "anthropic" }),
      }),
    );

    expect(response.status).toBe(400);
  });
});
