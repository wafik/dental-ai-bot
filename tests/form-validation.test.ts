import { describe, expect, it } from "bun:test";
import {
  adminLoginSchema,
  aiFieldErrors,
  calendarMappingSchema,
  chatMessageSchema,
  collectFieldErrors,
  scheduleDateSchema,
  validateSecretField,
} from "../src/utils/form-validation";

describe("collectFieldErrors", () => {
  it("returns an empty object for valid input", () => {
    expect(collectFieldErrors(adminLoginSchema, { username: "admin", password: "secret" })).toEqual(
      {},
    );
  });

  it("keys the first message by field name", () => {
    const errors = collectFieldErrors(adminLoginSchema, { username: "  ", password: "" });
    expect(errors.username).toBe("Username is required");
    expect(errors.password).toBe("Password is required");
  });

  it("ignores paths that are not top-level strings", () => {
    expect(collectFieldErrors(chatMessageSchema, { message: 42 })).toEqual({
      message: expect.any(String),
    });
  });
});

describe("adminLoginSchema", () => {
  it("rejects an over-long username and password", () => {
    const errors = collectFieldErrors(adminLoginSchema, {
      username: "a".repeat(129),
      password: "b".repeat(1025),
    });
    expect(errors.username).toBe("Username is too long");
    expect(errors.password).toBe("Password is too long");
  });

  it("accepts a normal credential pair", () => {
    expect(adminLoginSchema.safeParse({ username: "admin", password: "x" }).success).toBe(true);
  });
});

describe("calendarMappingSchema", () => {
  it("allows a blank calendar ID because blank clears the mapping", () => {
    expect(calendarMappingSchema.safeParse({ calendarId: "" }).success).toBe(true);
    expect(calendarMappingSchema.safeParse({ calendarId: "   " }).success).toBe(true);
  });

  it("accepts an email-like calendar ID", () => {
    expect(calendarMappingSchema.safeParse({ calendarId: "clinic@gmail.com" }).success).toBe(true);
    expect(
      calendarMappingSchema.safeParse({ calendarId: "abc123@group.calendar.google.com" }).success,
    ).toBe(true);
  });

  it("rejects a value that cannot be a calendar ID", () => {
    const result = calendarMappingSchema.safeParse({ calendarId: "not-an-id" });
    expect(result.success).toBe(false);
  });
});

describe("scheduleDateSchema", () => {
  it("accepts an ISO date and rejects anything else", () => {
    expect(scheduleDateSchema.safeParse({ date: "2026-10-29" }).success).toBe(true);
    expect(scheduleDateSchema.safeParse({ date: "29/10/2026" }).success).toBe(false);
    expect(scheduleDateSchema.safeParse({ date: "" }).success).toBe(false);
  });
});

describe("chatMessageSchema", () => {
  it("caps message length without flagging an empty composer", () => {
    expect(chatMessageSchema.safeParse({ message: "" }).success).toBe(true);
    expect(chatMessageSchema.safeParse({ message: "a".repeat(2000) }).success).toBe(true);
    expect(chatMessageSchema.safeParse({ message: "a".repeat(2001) }).success).toBe(false);
  });
});

describe("aiFieldErrors", () => {
  it("accepts blank fields because they fall back to env or default", () => {
    expect(aiFieldErrors({ baseUrl: "", model: "" })).toEqual({});
  });

  it("accepts an http(s) endpoint", () => {
    expect(aiFieldErrors({ baseUrl: "http://127.0.0.1:20128/v1", model: "any" })).toEqual({});
  });

  it("rejects a base URL that is not http(s)", () => {
    expect(aiFieldErrors({ baseUrl: "api.openai.com", model: "" }).baseUrl).toBe(
      "Use the full URL, e.g. https://api.openai.com/v1",
    );
    expect(aiFieldErrors({ baseUrl: "ftp://example.test", model: "" }).baseUrl).toBeTruthy();
  });

  it("caps the model name length", () => {
    expect(aiFieldErrors({ baseUrl: "", model: "m".repeat(129) }).model).toBe(
      "Model name is too long",
    );
  });
});

describe("validateSecretField", () => {
  it("treats a blank secret as valid because it keeps the stored value", () => {
    expect(validateSecretField("openai.apiKey", "")).toBeUndefined();
  });

  it("leaves unknowns and opaque secrets to the server", () => {
    expect(validateSecretField("openai.apiKey", "sk-anything-goes")).toBeUndefined();
    expect(validateSecretField("microsoft.clientSecret", "whatever")).toBeUndefined();
  });

  it("requires an email-shaped service account", () => {
    expect(
      validateSecretField("google.serviceAccountEmail", "svc@proj.iam.gserviceaccount.com"),
    ).toBeUndefined();
    expect(validateSecretField("google.serviceAccountEmail", "not-an-email")).toBe(
      "Enter the service account email address",
    );
  });

  it("requires the PEM header on the service account key", () => {
    expect(
      validateSecretField("google.serviceAccountPrivateKey", "-----BEGIN PRIVATE KEY-----\nabc"),
    ).toBeUndefined();
    expect(validateSecretField("google.serviceAccountPrivateKey", "MIIEvQIBADAN")).toBe(
      "Paste the full key, starting with -----BEGIN PRIVATE KEY-----",
    );
  });

  it("rejects a value past the storage limit", () => {
    expect(validateSecretField("openai.apiKey", "a".repeat(8193))).toBe("Value is too long");
  });
});
