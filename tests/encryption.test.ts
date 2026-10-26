import { describe, expect, test } from "bun:test";
import { decryptSecret, encryptSecret } from "../src/security/encryption";

const KEY = "a".repeat(64);

describe("AES-256-GCM secret encryption", () => {
  test("round-trips a secret bound to its key identifier", () => {
    const env = { SETTINGS_ENCRYPTION_KEY: KEY };
    const encrypted = encryptSecret("sk-test-value", "openai.apiKey", env);
    expect(encrypted.ciphertext).not.toContain("sk-test-value");
    expect(decryptSecret(encrypted, "openai.apiKey", env)).toBe("sk-test-value");
  });

  test("uses a fresh IV for every encryption", () => {
    const env = { SETTINGS_ENCRYPTION_KEY: KEY };
    const first = encryptSecret("same", "openai.apiKey", env);
    const second = encryptSecret("same", "openai.apiKey", env);
    expect(first.iv).not.toBe(second.iv);
  });

  test("rejects a tampered authentication tag", () => {
    const env = { SETTINGS_ENCRYPTION_KEY: KEY };
    const encrypted = encryptSecret("sk-test-value", "openai.apiKey", env);
    expect(() =>
      decryptSecret({ ...encrypted, authTag: "AAAAAAAAAAAAAAAAAAAAAA==" }, "openai.apiKey", env),
    ).toThrow("Unable to decrypt stored secret.");
  });

  test("rejects ciphertext moved to a different secret key (AAD binding)", () => {
    const env = { SETTINGS_ENCRYPTION_KEY: KEY };
    const encrypted = encryptSecret("sk-test-value", "openai.apiKey", env);
    expect(() => decryptSecret(encrypted, "google.clientSecret", env)).toThrow(
      "Unable to decrypt stored secret.",
    );
  });

  test("fails closed when the key is absent or malformed", () => {
    expect(() => encryptSecret("x", "openai.apiKey", {})).toThrow();
    expect(() =>
      encryptSecret("x", "openai.apiKey", { SETTINGS_ENCRYPTION_KEY: "short" }),
    ).toThrow();
  });

  test("supports a previous key version for rotation", () => {
    const previous = "b".repeat(64);
    const oldEnv = { SETTINGS_ENCRYPTION_KEY: previous };
    const encrypted = encryptSecret("rotate-me", "openai.apiKey", oldEnv);
    const rotationEnv = {
      SETTINGS_ENCRYPTION_KEY: KEY,
      SETTINGS_ENCRYPTION_KEY_PREVIOUS: previous,
    };
    expect(decryptSecret({ ...encrypted, keyVersion: "v0" }, "openai.apiKey", rotationEnv)).toBe(
      "rotate-me",
    );
  });
});
