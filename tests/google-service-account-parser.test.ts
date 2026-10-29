import { describe, expect, it } from "bun:test";
import { parseGoogleServiceAccountJson } from "../src/utils/google-service-account";

const VALID_KEY = JSON.stringify({
  type: "service_account",
  project_id: "warungku-51995",
  private_key_id: "abc123",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n",
  client_email: "dentis@warungku-51995.iam.gserviceaccount.com",
  client_id: "116228040498679280958",
  token_uri: "https://oauth2.googleapis.com/token",
});

describe("parseGoogleServiceAccountJson", () => {
  it("extracts the email and private key from a valid key file", () => {
    expect(parseGoogleServiceAccountJson(VALID_KEY)).toEqual({
      email: "dentis@warungku-51995.iam.gserviceaccount.com",
      privateKey: "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----",
    });
  });

  it("rejects text that is not JSON", () => {
    expect(parseGoogleServiceAccountJson("not json")).toBeNull();
  });

  it("rejects JSON without the required fields", () => {
    expect(parseGoogleServiceAccountJson(JSON.stringify({ client_email: "a@b.c" }))).toBeNull();
    expect(parseGoogleServiceAccountJson(JSON.stringify({ private_key: "nope" }))).toBeNull();
  });

  it("rejects a private_key that is not a PEM block", () => {
    expect(
      parseGoogleServiceAccountJson(
        JSON.stringify({ client_email: "a@b.c", private_key: "just-a-string" }),
      ),
    ).toBeNull();
  });

  it("rejects non-object JSON", () => {
    expect(parseGoogleServiceAccountJson("null")).toBeNull();
    expect(parseGoogleServiceAccountJson('"text"')).toBeNull();
    expect(parseGoogleServiceAccountJson("[1,2]")).toBeNull();
  });
});
