import {
  CHAT_ASSISTANT_MESSAGE_MAX_LENGTH,
  CHAT_HISTORY_MAX_CHARACTERS,
  CHAT_HISTORY_MAX_MESSAGES,
  CHAT_USER_MESSAGE_MAX_LENGTH,
  type PublicChatMessage,
} from "./form-validation";

export function selectRecentChatHistory(
  history: readonly { role: string; content: unknown }[],
): PublicChatMessage[] {
  const normalized: PublicChatMessage[] = [];
  for (const entry of history) {
    if (typeof entry.content !== "string") continue;
    if (entry.role === "user") {
      const content = entry.content.trim();
      if (content)
        normalized.push({ role: "user", content: content.slice(-CHAT_USER_MESSAGE_MAX_LENGTH) });
    } else if (entry.role === "assistant") {
      normalized.push({
        role: "assistant",
        content: entry.content.slice(-CHAT_ASSISTANT_MESSAGE_MAX_LENGTH),
      });
    }
  }
  const selected: PublicChatMessage[] = [];
  let total = 0;
  for (let index = normalized.length - 1; index >= 0; index--) {
    const message = normalized[index]!;
    if (
      selected.length >= CHAT_HISTORY_MAX_MESSAGES ||
      total + message.content.length > CHAT_HISTORY_MAX_CHARACTERS
    )
      break;
    selected.unshift(message);
    total += message.content.length;
  }
  return selected;
}
