import type {
  AdminSettingsUpdate,
  AdminSettingsView,
  SecretGroupDef,
} from "@/domain/admin-settings";

/** A failed admin request. `status` lets callers react to 401 without parsing bodies. */
export class AdminApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
  }
}

const MUTATION_HEADERS = {
  "content-type": "application/json",
  "x-admin-action": "1",
} as const;

/**
 * A malformed payload must fail loudly: rendering an empty settings object
 * would silently wipe the operator's view of the stored configuration.
 */
function asSettings(value: unknown): AdminSettingsView | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as AdminSettingsView;
  return Array.isArray(candidate.dentistMappings) && candidate.ai ? candidate : null;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const payload: unknown = await response.json().catch(() => ({}));
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
}

async function request(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(path, { credentials: "same-origin", ...init });
  const payload = await readJson(response);

  if (!response.ok) {
    const message =
      typeof payload.error === "string"
        ? payload.error
        : `Request failed with status ${response.status}`;
    throw new AdminApiError(response.status, message);
  }

  return payload;
}

export async function fetchAdminSettings(): Promise<AdminSettingsView> {
  const payload = await request("/api/v1/admin/settings", {
    headers: { accept: "application/json" },
  });
  const settings = asSettings(payload.settings);
  if (!settings) {
    throw new Error("Malformed settings response");
  }
  return settings;
}

export async function saveAdminSettings(update: AdminSettingsUpdate): Promise<AdminSettingsView> {
  const payload = await request("/api/v1/admin/settings", {
    method: "PUT",
    headers: MUTATION_HEADERS,
    body: JSON.stringify(update),
  });
  const settings = asSettings(payload.settings);
  if (!settings) {
    throw new Error("Malformed settings response");
  }
  return settings;
}

export type AdminConnectionTest = { success: boolean; message: string };

/**
 * The route wraps the provider probe in `{ success, result }`; the probe's own
 * verdict is what decides the toast, so an unreachable provider must not read
 * as a successful HTTP call.
 */
export async function testAdminConnection(
  provider: SecretGroupDef["testProvider"],
  draft: Record<string, string>,
): Promise<AdminConnectionTest> {
  const payload = await request("/api/v1/admin/test-connection", {
    method: "POST",
    headers: MUTATION_HEADERS,
    body: JSON.stringify({ provider, draft }),
  });

  const result = payload.result;
  if (!result || typeof result !== "object") {
    return { success: false, message: "Connection test returned no result." };
  }

  const { success, message } = result as { success?: unknown; message?: unknown };
  return {
    success: success === true,
    message: typeof message === "string" ? message : "Connection test finished.",
  };
}

/** Best effort: the caller navigates away regardless of the response. */
export async function logoutAdmin(): Promise<void> {
  await fetch("/api/v1/admin/logout", {
    method: "POST",
    credentials: "same-origin",
    headers: { "x-admin-action": "1" },
  }).catch(() => undefined);
}
