import { afterEach, describe, expect, it } from "bun:test";
import type { AdminSettingsView } from "../src/domain/admin-settings";
import {
  AdminApiError,
  fetchAdminSettings,
  saveAdminSettings,
  testAdminConnection,
} from "../src/services/admin-settings-client";

const originalFetch = globalThis.fetch;

function mockFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Response) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(input, init)) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const VALID_SETTINGS: AdminSettingsView = {
  calendarProvider: "none",
  dentistMappings: [],
  ai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  secrets: {},
};

describe("admin-settings-client", () => {
  it("returns the settings payload on success", async () => {
    mockFetch(() => Response.json({ success: true, settings: VALID_SETTINGS }));

    await expect(fetchAdminSettings()).resolves.toEqual(VALID_SETTINGS);
  });

  it("rejects a payload without dentistMappings instead of rendering blank", async () => {
    mockFetch(() => Response.json({ success: true, settings: { calendarProvider: "none" } }));

    await expect(fetchAdminSettings()).rejects.toThrow("Malformed settings response");
  });

  it("surfaces the server error message and status", async () => {
    mockFetch(() => Response.json({ error: "Forbidden" }, { status: 403 }));

    const error = await saveAdminSettings({
      calendarProvider: "none",
      dentistMappings: [],
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AdminApiError);
    expect((error as AdminApiError).status).toBe(403);
    expect((error as AdminApiError).message).toBe("Forbidden");
  });

  it("sends the CSRF header on mutations but not on reads", async () => {
    const seen: Array<Record<string, string>> = [];
    mockFetch((_input, init) => {
      seen.push((init?.headers ?? {}) as Record<string, string>);
      return Response.json({ success: true, settings: VALID_SETTINGS, result: {} });
    });

    await fetchAdminSettings();
    await saveAdminSettings({ calendarProvider: "none", dentistMappings: [] });

    expect(seen[0]).toMatchObject({ accept: "application/json" });
    expect(seen[0]?.["x-admin-action"]).toBeUndefined();
    expect(seen[1]?.["x-admin-action"]).toBe("1");
  });

  it("reports the probe verdict, not the HTTP status, for connection tests", async () => {
    mockFetch(() =>
      Response.json({ success: true, result: { success: false, message: "Bad API key" } }),
    );

    await expect(testAdminConnection("openai", {})).resolves.toEqual({
      success: false,
      message: "Bad API key",
    });
  });

  it("treats a missing probe result as a failure", async () => {
    mockFetch(() => Response.json({ success: true }));

    await expect(testAdminConnection("google", {})).resolves.toEqual({
      success: false,
      message: "Connection test returned no result.",
    });
  });
});
