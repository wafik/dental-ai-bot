import { describe, expect, it } from "bun:test";
import { Badge } from "../src/components/ui/badge";
import { Input } from "../src/components/ui/input";
import { ServicesCatalog } from "../src/components/services-catalog";
import { SchedulePreview } from "../src/components/schedule-preview";
import { ChatWidget } from "../src/components/chat-widget";
import { VoiceCallWidget } from "../src/components/voice-call-widget";
import Home from "../src/app/page";

describe("UI Components & Portal", () => {
  it("exports UI primitives properly", () => {
    expect(Badge).toBeDefined();
    expect(Input).toBeDefined();
  });

  it("exports feature widgets and catalog properly", () => {
    expect(ServicesCatalog).toBeDefined();
    expect(SchedulePreview).toBeDefined();
    expect(ChatWidget).toBeDefined();
    expect(VoiceCallWidget).toBeDefined();
  });

  it("exports main page component properly", () => {
    expect(Home).toBeDefined();
    expect(typeof Home).toBe("function");
  });
});
