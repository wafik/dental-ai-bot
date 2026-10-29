import { z } from "zod";

export const CHAT_USER_MESSAGE_MAX_LENGTH = 2_000;
export const CHAT_ASSISTANT_MESSAGE_MAX_LENGTH = 8_000;
export const CHAT_HISTORY_MAX_MESSAGES = 60;
export const CHAT_HISTORY_MAX_CHARACTERS = 32_000;
export const CHAT_REQUEST_MAX_BYTES = 256 * 1024;

export const publicChatMessageSchema = z.discriminatedUnion("role", [
  z.strictObject({
    role: z.literal("user"),
    content: z.string().trim().min(1).max(CHAT_USER_MESSAGE_MAX_LENGTH),
  }),
  z.strictObject({
    role: z.literal("assistant"),
    content: z.string().max(CHAT_ASSISTANT_MESSAGE_MAX_LENGTH),
  }),
]);
export type PublicChatMessage = z.infer<typeof publicChatMessageSchema>;
export const chatRequestSchema = z.strictObject({
  messages: z
    .array(publicChatMessageSchema)
    .min(1)
    .max(CHAT_HISTORY_MAX_MESSAGES)
    .refine(
      (messages) =>
        messages.reduce((total, message) => total + message.content.length, 0) <=
        CHAT_HISTORY_MAX_CHARACTERS,
      "History is too long",
    )
    .refine(
      (messages) => messages.at(-1)?.role === "user",
      "The final message must be from the user",
    ),
});

/**
 * First error message per top-level field, keyed by field name. Safe to call
 * during render: invalid input maps to messages instead of throwing, so the
 * result can drive live inline validation on every keystroke.
 */
export function collectFieldErrors(schema: z.ZodType, value: unknown): Record<string, string> {
  const result = schema.safeParse(value);
  if (result.success) {
    return {};
  }

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && errors[key] === undefined) {
      errors[key] = issue.message;
    }
  }
  return errors;
}

/** Mirrors the server-side login schema so both ends reject the same shapes. */
export const adminLoginSchema = z.object({
  username: z.string().trim().min(1, "Username is required").max(128, "Username is too long"),
  password: z.string().min(1, "Password is required").max(1024, "Password is too long"),
});

/**
 * A blank calendar ID is valid: the runtime treats it as "not configured" and
 * the settings route uses it to clear a mapping.
 */
export const calendarMappingSchema = z.object({
  calendarId: z
    .string()
    .trim()
    .max(512, "Calendar ID is too long")
    .refine(
      (value) => value === "" || value.includes("@"),
      "Use the calendar's email-like ID, e.g. clinic@gmail.com",
    ),
});

/** The message for one calendar ID, or undefined when it is acceptable. */
export function calendarIdError(calendarId: string): string | undefined {
  return calendarMappingSchema.safeParse({ calendarId }).error?.issues[0]?.message;
}

/**
 * Only a length cap. An empty composer is not an error: the send button is
 * already disabled in that state, so flagging it would just add noise.
 */
export const chatMessageSchema = z.object({
  message: z.string().max(CHAT_USER_MESSAGE_MAX_LENGTH, "Message must be 2000 characters or fewer"),
});

export const scheduleDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date using the date field"),
});

/**
 * AI endpoint fields are optional: a blank value falls back to the stored
 * setting, then the environment, then the built-in default.
 */
export const aiEndpointSchema = z.object({
  baseUrl: z
    .string()
    .trim()
    .max(512, "Base URL is too long")
    .refine(
      (value) => value === "" || isHttpUrl(value),
      "Use the full URL, e.g. https://api.openai.com/v1",
    ),
  model: z.string().trim().max(128, "Model name is too long"),
});

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** Field messages for the AI endpoint card, empty when both fields are fine. */
export function aiFieldErrors(ai: { baseUrl: string; model: string }): Record<string, string> {
  return collectFieldErrors(aiEndpointSchema, ai);
}

/**
 * A blank secret is always valid because it means "keep the stored value".
 * Values that are supplied only need to be plausible, so the rules stay loose
 * where providers vary and strict only where the format is fixed.
 */
const SECRET_SHAPES: Record<string, (value: string) => string | undefined> = {
  "google.serviceAccountEmail": (value) =>
    value.includes("@") ? undefined : "Enter the service account email address",
  "google.serviceAccountPrivateKey": (value) =>
    value.startsWith("-----BEGIN PRIVATE KEY-----")
      ? undefined
      : "Paste the full key, starting with -----BEGIN PRIVATE KEY-----",
};

const SECRET_MAX_LENGTH = 8192;

const secretLengthSchema = z.string().max(SECRET_MAX_LENGTH, "Value is too long");

export function validateSecretField(key: string, value: string): string | undefined {
  if (value.length === 0) {
    return undefined;
  }

  const length = secretLengthSchema.safeParse(value);
  if (!length.success) {
    return length.error.issues[0]?.message;
  }

  return SECRET_SHAPES[key]?.(value);
}
