import { describe, expect, it, beforeEach } from "bun:test";
import { InMemoryAppointmentRepository } from "../src/repository/in-memory-appointment-repository";
import type {
  CalendarProvider,
  BusyInterval,
  CalendarEventInput,
  CreatedCalendarEvent,
} from "../src/providers/calendar/calendar-provider";
import type {
  LLMProvider,
  LLMChatRequest,
  LLMChatResponse,
  LLMChatMessage,
} from "../src/providers/ai/llm-provider";
import { AppointmentService } from "../src/services/appointment-service";
import { SYSTEM_PROMPT } from "../src/safety/system-prompt";
import { ChatOrchestrator } from "../src/services/chat-orchestrator";

class MockCalendarProvider implements CalendarProvider {
  busyIntervals: BusyInterval[] = [];
  createdEvents: CalendarEventInput[] = [];

  async getBusyIntervals(_input: {
    dentistId: string;
    start: string;
    end: string;
  }): Promise<BusyInterval[]> {
    return this.busyIntervals;
  }

  async createEvent(input: CalendarEventInput): Promise<CreatedCalendarEvent> {
    this.createdEvents.push(input);
    return {
      id: `cal-evt-${this.createdEvents.length}`,
      start: input.start,
      end: input.end,
    };
  }
}

class MockLLMProvider implements LLMProvider {
  public calls: LLMChatRequest[] = [];
  private responses: LLMChatResponse[] = [];

  constructor(responses: LLMChatResponse[] = []) {
    this.responses = [...responses];
  }

  queueResponse(response: LLMChatResponse) {
    this.responses.push(response);
  }

  async chat(request: LLMChatRequest): Promise<LLMChatResponse> {
    this.calls.push(request);
    const next = this.responses.shift();
    if (!next) {
      throw new Error("No mocked response available in MockLLMProvider");
    }
    return next;
  }
}

describe("ChatOrchestrator", () => {
  let repository: InMemoryAppointmentRepository;
  let calendarProvider: MockCalendarProvider;
  let appointmentService: AppointmentService;
  let mockLLM: MockLLMProvider;

  beforeEach(() => {
    repository = new InMemoryAppointmentRepository();
    calendarProvider = new MockCalendarProvider();
    appointmentService = new AppointmentService(repository, calendarProvider);
    mockLLM = new MockLLMProvider();
  });

  describe("Direct conversational turn without tool calls", () => {
    it("returns assistant reply directly when no tool calls are made", async () => {
      mockLLM.queueResponse({
        message: {
          role: "assistant",
          content: "BrightSmile Clinic is open Monday to Saturday from 09:00 to 17:00.",
        },
        finishReason: "stop",
      });

      const orchestrator = new ChatOrchestrator({
        llmProvider: mockLLM,
        appointmentService,
      });

      const result = await orchestrator.handleUserMessage([], "What are your hours?");

      expect(result.reply).toBe(
        "BrightSmile Clinic is open Monday to Saturday from 09:00 to 17:00.",
      );
      expect(mockLLM.calls).toHaveLength(1);
      const firstCall = mockLLM.calls[0];
      expect(firstCall).toBeDefined();
      // Injected system prompt + user message
      expect(firstCall!.messages).toHaveLength(2);
      expect(firstCall!.messages[0]?.role).toBe("system");
      expect(firstCall!.messages[0]?.content).toBe(SYSTEM_PROMPT);
      expect(firstCall!.messages[1]).toEqual({
        role: "user",
        content: "What are your hours?",
      });

      // Final returned messages
      expect(result.messages).toHaveLength(3);
      expect(result.messages[2]!).toEqual({
        role: "assistant",
        content: "BrightSmile Clinic is open Monday to Saturday from 09:00 to 17:00.",
      });
    });
  });

  describe("Single tool call turn", () => {
    it("invokes executeAppointmentTool and feeds tool result back to model", async () => {
      // Step 1: LLM requests list_services tool
      mockLLM.queueResponse({
        message: {
          role: "assistant",
          content: null,
          toolCalls: [
            {
              id: "call-1",
              name: "list_services",
              arguments: {},
            },
          ],
        },
        finishReason: "tool_calls",
      });

      // Step 2: LLM summarizes the services after receiving tool output
      mockLLM.queueResponse({
        message: {
          role: "assistant",
          content:
            "We offer 5 services: General Checkup (A), Simple Extraction (B), Root Canal (C), Crown (D), and Implant (E).",
        },
        finishReason: "stop",
      });

      const orchestrator = new ChatOrchestrator({
        llmProvider: mockLLM,
        appointmentService,
      });

      const result = await orchestrator.handleUserMessage([], "What dental services do you offer?");

      expect(mockLLM.calls).toHaveLength(2);
      const secondCall = mockLLM.calls[1];
      expect(secondCall).toBeDefined();

      // Verify second LLM call received tool message
      const secondCallMessages = secondCall!.messages;
      expect(secondCallMessages).toHaveLength(4);
      expect(secondCallMessages[2]?.role).toBe("assistant");
      expect(secondCallMessages[3]?.role).toBe("tool");

      const toolMsg = secondCallMessages[3] as {
        role: "tool";
        toolCallId: string;
        name: string;
        content: string;
      };
      expect(toolMsg.toolCallId).toBe("call-1");
      expect(toolMsg.name).toBe("list_services");

      const parsedToolContent = JSON.parse(toolMsg.content);
      const servicesList = Array.isArray(parsedToolContent)
        ? parsedToolContent
        : parsedToolContent.services;
      expect(servicesList).toBeDefined();
      expect(servicesList).toHaveLength(5);

      expect(result.reply).toContain("We offer 5 services");
      expect(result.messages).toHaveLength(5);
    });
  });

  describe("Multi-turn tool calling sequence", () => {
    it("handles availability check followed by booking in sequence", async () => {
      // Step 1: Model requests check_availability
      mockLLM.queueResponse({
        message: {
          role: "assistant",
          content: null,
          toolCalls: [
            {
              id: "call-check",
              name: "check_availability",
              arguments: {
                serviceCode: "A",
                date: "2026-10-25",
                dentistId: "junior",
              },
            },
          ],
        },
        finishReason: "tool_calls",
      });

      // Step 2: Model requests book_appointment
      mockLLM.queueResponse({
        message: {
          role: "assistant",
          content: null,
          toolCalls: [
            {
              id: "call-book",
              name: "book_appointment",
              arguments: {
                serviceCode: "A",
                dentistId: "junior",
                date: "2026-10-25",
                startTime: "09:00",
                patientName: "Alice Smith",
                patientPhone: "08123456789",
              },
            },
          ],
        },
        finishReason: "tool_calls",
      });

      // Step 3: Model returns confirmation
      mockLLM.queueResponse({
        message: {
          role: "assistant",
          content:
            "Your appointment for Service A with Junior on 2026-10-25 at 09:00 has been successfully booked!",
        },
        finishReason: "stop",
      });

      const orchestrator = new ChatOrchestrator({
        llmProvider: mockLLM,
        appointmentService,
      });

      const result = await orchestrator.handleUserMessage(
        [],
        "Please check if Junior is available for Service A on 2026-10-25 and book 09:00 for Alice Smith (08123456789).",
      );

      expect(mockLLM.calls).toHaveLength(3);
      expect(result.reply).toContain("successfully booked");

      // Verify appointment actually persisted in repository
      const allAppts = await repository.find({ date: "2026-10-25" });
      expect(allAppts).toHaveLength(1);
      expect(allAppts[0]?.patientName).toBe("Alice Smith");
      expect(allAppts[0]?.dentistId).toBe("junior");
    });
  });

  describe("System prompt prepending", () => {
    it("automatically prepends default SYSTEM_PROMPT when history has no system message", async () => {
      mockLLM.queueResponse({
        message: {
          role: "assistant",
          content: "Hello! How can I assist you today?",
        },
        finishReason: "stop",
      });

      const orchestrator = new ChatOrchestrator({
        llmProvider: mockLLM,
        appointmentService,
      });

      const history: LLMChatMessage[] = [{ role: "user", content: "Hi" }];
      const result = await orchestrator.handleUserMessage(history);

      expect(result.messages[0]!).toEqual({
        role: "system",
        content: SYSTEM_PROMPT,
      });
      expect(result.messages[1]!).toEqual({
        role: "user",
        content: "Hi",
      });
    });

    it("preserves custom system prompt if provided in orchestrator options", async () => {
      const customPrompt = "You are an assistant for a specialized clinic.";
      mockLLM.queueResponse({
        message: {
          role: "assistant",
          content: "Greetings!",
        },
        finishReason: "stop",
      });

      const orchestrator = new ChatOrchestrator({
        llmProvider: mockLLM,
        appointmentService,
        systemPrompt: customPrompt,
      });

      const result = await orchestrator.handleUserMessage([], "Hi");

      expect(result.messages[0]!).toEqual({
        role: "system",
        content: customPrompt,
      });
    });

    it("does not duplicate system prompt if history already contains one at index 0", async () => {
      const existingPrompt = "Existing system instructions.";
      mockLLM.queueResponse({
        message: {
          role: "assistant",
          content: "Understood.",
        },
        finishReason: "stop",
      });

      const orchestrator = new ChatOrchestrator({
        llmProvider: mockLLM,
        appointmentService,
      });

      const history: LLMChatMessage[] = [
        { role: "system", content: existingPrompt },
        { role: "user", content: "Hello" },
      ];

      const result = await orchestrator.handleUserMessage(history);

      expect(result.messages[0]!).toEqual({
        role: "system",
        content: existingPrompt,
      });
      expect(result.messages[1]!).toEqual({
        role: "user",
        content: "Hello",
      });
      // Should not have a second system prompt
      expect(result.messages.filter((m) => m.role === "system")).toHaveLength(1);
    });
  });

  describe("Maximum iteration safety guard", () => {
    it("terminates safely with a graceful fallback when model exceeds maxIterations", async () => {
      // Configure mock to keep returning tool calls indefinitely
      for (let i = 0; i < 10; i++) {
        mockLLM.queueResponse({
          message: {
            role: "assistant",
            content: null,
            toolCalls: [
              {
                id: `call-loop-${i}`,
                name: "list_services",
                arguments: {},
              },
            ],
          },
          finishReason: "tool_calls",
        });
      }

      const orchestrator = new ChatOrchestrator({
        llmProvider: mockLLM,
        appointmentService,
        maxIterations: 3,
      });

      const result = await orchestrator.handleUserMessage([], "Loop test");

      expect(mockLLM.calls).toHaveLength(3);
      expect(result.reply).toBeDefined();
      expect(result.reply.length).toBeGreaterThan(0);
      expect(result.reply.toLowerCase()).toMatch(/apologize|unable|limit|trouble|please contact/i);

      // The last message in returned history should be the fallback assistant reply
      const lastMsg = result.messages[result.messages.length - 1];
      expect(lastMsg).toBeDefined();
      expect(lastMsg!.role).toBe("assistant");
      expect(lastMsg!.content).toBe(result.reply);
    });
  });

  describe("Tool execution failure handling", () => {
    it("feeds error output from tool back to model for user explanation", async () => {
      // Step 1: Model requests booking for Junior with Service C (unqualified)
      mockLLM.queueResponse({
        message: {
          role: "assistant",
          content: null,
          toolCalls: [
            {
              id: "call-unqualified",
              name: "book_appointment",
              arguments: {
                serviceCode: "C",
                dentistId: "junior",
                date: "2026-10-25",
                startTime: "09:00",
                patientName: "Bob",
                patientPhone: "08123456789",
              },
            },
          ],
        },
        finishReason: "tool_calls",
      });

      // Step 2: Model receives tool error and explains restriction to user
      mockLLM.queueResponse({
        message: {
          role: "assistant",
          content:
            "I apologize, but Junior is not qualified for Service C (Root Canal). I can book this with Senior 1 or Senior 2 instead. Would you like me to check their availability?",
        },
        finishReason: "stop",
      });

      const orchestrator = new ChatOrchestrator({
        llmProvider: mockLLM,
        appointmentService,
      });

      const result = await orchestrator.handleUserMessage([], "Book Service C with Junior");

      expect(mockLLM.calls).toHaveLength(2);
      const secondCall = mockLLM.calls[1];
      expect(secondCall).toBeDefined();

      // Check tool message content in call 2
      const toolMsg = secondCall!.messages[3] as {
        role: "tool";
        toolCallId: string;
        content: string;
      };
      expect(toolMsg.role).toBe("tool");
      const toolOutput = JSON.parse(toolMsg.content);
      expect(toolOutput.success).toBe(false);
      expect(toolOutput.error).toContain("junior");

      // Assistant explains restriction
      expect(result.reply).toContain("Junior is not qualified for Service C");
    });
  });
});
