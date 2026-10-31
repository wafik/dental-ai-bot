// Live end-to-end check of the real GoogleCalendarAdapter against a real
// service-account key file. Manual only: automated tests never touch the network.
// Usage: bun scripts/probe-google-adapter.ts <service-account.json> [calendarId]
// Without a calendar ID it works on "primary"; pass a shared calendar ID to
// prove the share works. A service account's calendarList often stays empty
// even when the share is correct, so direct access is the real test.
// Never prints the private key or access token.
import { readFileSync } from "node:fs";
import { GoogleCalendarAdapter } from "../src/providers/calendar/google-calendar-adapter";

const KEY_PATH = process.argv[2];
if (!KEY_PATH) {
  console.error("usage: bun scripts/probe-google-adapter.ts <service-account.json> [calendarId]");
  process.exit(1);
}

const creds = JSON.parse(readFileSync(KEY_PATH, "utf8")) as {
  client_email: string;
  private_key: string;
  project_id?: string;
  client_id?: string;
};

// Non-secret identity fields, so the operator can match what they shared with.
console.log("--- key identity ---");
console.log(`client_email: ${creds.client_email}`);
console.log(`project_id: ${creds.project_id ?? "(none)"}`);
console.log(`client_id: ${creds.client_id ?? "(none)"}`);

const target = process.argv[3]?.trim() || "primary";
console.log(`\n--- target calendar: ${target} ---`);

const adapter = new GoogleCalendarAdapter({
  serviceAccountEmail: creds.client_email,
  privateKey: creds.private_key,
  calendarIds: { junior: target, "senior-1": target, "senior-2": target },
});

const start = new Date(Date.now() + 60 * 60 * 1000);
const end = new Date(start.getTime() + 30 * 60 * 1000);

try {
  const busy = await adapter.getBusyIntervals({
    dentistId: "junior",
    start: start.toISOString(),
    end: end.toISOString(),
  });
  console.log(`freebusy ok: ${busy.length} busy interval(s)`);
} catch (error: unknown) {
  console.log(`freebusy FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

console.log("\n--- createEvent ---");
let createdId: string | null = null;
try {
  const created = await adapter.createEvent({
    dentistId: "junior",
    summary: "BrightSmile adapter probe",
    description: "Created by scripts/probe-google-adapter.ts, deleted immediately after.",
    start: start.toISOString(),
    end: end.toISOString(),
  });
  createdId = created.id;
  console.log(`create ok: eventId=${created.id}`);
} catch (error: unknown) {
  console.log(`create FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

if (!createdId) {
  console.log("\nSkipping busy-after check and cleanup: no event was created.");
  process.exit();
}

const busyAfter = await adapter.getBusyIntervals({
  dentistId: "junior",
  start: start.toISOString(),
  end: end.toISOString(),
});
console.log(`\nbusy after create: ${busyAfter.length} interval(s)`);

// The adapter has no delete; clean up with a plain authenticated request.
const { createSign } = await import("node:crypto");
const b64 = (input: Buffer | string) =>
  Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const nowSec = Math.floor(Date.now() / 1000);
const unsigned = `${b64(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64(
  JSON.stringify({
    iss: creds.client_email,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: "https://oauth2.googleapis.com/token",
    iat: nowSec,
    exp: nowSec + 3600,
  }),
)}`;
const signer = createSign("RSA-SHA256");
signer.update(unsigned);
const assertion = `${unsigned}.${b64(signer.sign(creds.private_key))}`;
const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  }).toString(),
});
const token = ((await tokenRes.json()) as { access_token?: string }).access_token;
if (!token) {
  console.error(`cleanup skipped: token exchange ${tokenRes.status}`);
  process.exit(1);
}

const del = await fetch(
  `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(target)}/events/${encodeURIComponent(createdId)}`,
  { method: "DELETE", headers: { authorization: `Bearer ${token}` } },
);
console.log(`\ncleanup delete: ${del.status}`);
