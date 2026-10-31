export type GoogleServiceAccountDraft = {
  email: string;
  privateKey: string;
};

/**
 * Reads the parts of a downloaded Google service-account key file that the
 * admin console stores. Returns null when the text is not a valid key file.
 * The file never leaves the browser: only these two values become drafts.
 */
export function parseGoogleServiceAccountJson(raw: string): GoogleServiceAccountDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const candidate = parsed as { client_email?: unknown; private_key?: unknown };
  const email = typeof candidate.client_email === "string" ? candidate.client_email.trim() : "";
  const privateKey = typeof candidate.private_key === "string" ? candidate.private_key.trim() : "";

  if (!email || !privateKey || !privateKey.includes("PRIVATE KEY")) {
    return null;
  }

  return { email, privateKey };
}
