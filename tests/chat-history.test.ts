import { describe, expect, it } from "bun:test";
import { selectRecentChatHistory } from "../src/utils/chat-history";
import {
  CHAT_HISTORY_MAX_CHARACTERS,
  CHAT_HISTORY_MAX_MESSAGES,
  CHAT_ASSISTANT_MESSAGE_MAX_LENGTH,
} from "../src/utils/form-validation";

describe("selectRecentChatHistory", () => {
  it("keeps the newest contiguous suffix within count and size limits", () => {
    const history = [
      ...Array.from({ length: 70 }, (_, index) => ({ role: "user", content: `old-${index}` })),
      { role: "assistant", content: "x".repeat(9000) },
      { role: "user", content: "latest" },
    ];
    const selected = selectRecentChatHistory(history);
    expect(selected).toHaveLength(CHAT_HISTORY_MAX_MESSAGES);
    expect(selected.at(-2)?.content).toHaveLength(CHAT_ASSISTANT_MESSAGE_MAX_LENGTH);
    expect(selected.at(-1)).toEqual({ role: "user", content: "latest" });
    expect(selected[0]?.content).toBe("old-12");
  });
  it("bounds total characters without dropping the latest user entry", () => {
    const history = [
      ...Array.from({ length: 10 }, () => ({ role: "assistant", content: "x".repeat(8000) })),
      { role: "user", content: "yes" },
    ];
    const selected = selectRecentChatHistory(history);
    expect(selected.at(-1)?.content).toBe("yes");
    expect(selected.reduce((sum, message) => sum + message.content.length, 0)).toBeLessThanOrEqual(
      CHAT_HISTORY_MAX_CHARACTERS,
    );
    expect(selected).toHaveLength(4);
  });
});
