import { describe, expect, it } from "bun:test";
import { InMemoryAppointmentRepository } from "../src/repository/in-memory-appointment-repository";
import { AppointmentService } from "../src/services/appointment-service";
import { createVoiceSessionHandler } from "../src/app/api/v1/voice/session/route";
import { createVoiceToolsHandler } from "../src/app/api/v1/voice/tools/route";
import type { VoiceProvider, VoiceSessionResponse } from "../src/providers/voice/voice-provider";

describe("Voice API Route Handlers", () => {
  describe("POST /api/v1/voice/session", () => {
    it("returns ephemeral session token when voice provider succeeds", async () => {
      const mockVoiceProvider: VoiceProvider = {
        createSession: async (): Promise<VoiceSessionResponse> =>
          ({
            provider: "openai-realtime",
            sessionId: "sess_mock_123",
            clientSecret: "ek_mock_token_456",
            model: "gpt-4o-realtime-preview-2024-12-17",
            voice: "alloy",
            expiresAt: 1730000000,
            masterKey: "dummy-secret-not-for-client",
          }) as VoiceSessionResponse,
      };

      const handler = createVoiceSessionHandler({ voiceProvider: mockVoiceProvider });
      const request = new Request("http://localhost/api/v1/voice/session", {
        method: "POST",
      });

      const response = await handler(request);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(json.data.provider).toBe("openai-realtime");
      expect(json.data.masterKey).toBeUndefined();
      expect(json.data.sessionId).toBe("sess_mock_123");
      expect(json.data.clientSecret).toBe("ek_mock_token_456");
    });

    it("returns error status when voice provider fails", async () => {
      const mockVoiceProvider: VoiceProvider = {
        createSession: async (): Promise<VoiceSessionResponse> => {
          throw new Error("Failed to reach OpenAI Realtime API");
        },
      };

      const handler = createVoiceSessionHandler({ voiceProvider: mockVoiceProvider });
      const request = new Request("http://localhost/api/v1/voice/session", {
        method: "POST",
      });

      const response = await handler(request);
      expect(response.status).toBe(500);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("Internal server error");
    });
  });

  describe("POST /api/v1/voice/tools", () => {
    const repository = new InMemoryAppointmentRepository();
    const service = new AppointmentService(repository);
    const handler = createVoiceToolsHandler({ appointmentService: service });

    it("returns 400 when toolName is missing", async () => {
      const request = new Request("http://localhost/api/v1/voice/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arguments: {} }),
      });

      const response = await handler(request);
      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("toolName is required");
    });

    it("executes list_services tool successfully", async () => {
      const request = new Request("http://localhost/api/v1/voice/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolName: "list_services",
          arguments: {},
        }),
      });

      const response = await handler(request);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.toolName).toBe("list_services");
      expect(json.result).toHaveLength(5);
    });

    it("executes check_availability tool successfully", async () => {
      const request = new Request("http://localhost/api/v1/voice/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolName: "check_availability",
          arguments: {
            serviceCode: "A",
            date: "2026-10-28",
            dentistId: "junior",
          },
        }),
      });

      const response = await handler(request);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.result.slots.length).toBeGreaterThan(0);
    });

    it("authoritatively rejects unqualified bookings (Junior for Service C)", async () => {
      const request = new Request("http://localhost/api/v1/voice/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolName: "book_appointment",
          arguments: {
            serviceCode: "C",
            dentistId: "junior",
            date: "2026-10-28",
            startTime: "10:00",
            patientName: "John Doe",
            patientPhone: "+62812345678",
          },
        }),
      });

      const response = await handler(request);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.result.success).toBe(false);
      expect(json.result.error).toContain("Dentist 'junior' is not qualified to perform Service C");
    });

    it("authoritatively accepts qualified bookings (Senior 1 for Service C)", async () => {
      const request = new Request("http://localhost/api/v1/voice/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolName: "book_appointment",
          arguments: {
            serviceCode: "C",
            dentistId: "senior-1",
            date: "2026-10-28",
            startTime: "10:00",
            patientName: "Alice Smith",
            patientPhone: "+62812345678",
          },
        }),
      });

      const response = await handler(request);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.result.success).toBe(true);
      expect(json.result.appointment.status).toBe("confirmed");
    });
  });
});
