import { describe, expect, it } from "bun:test";
import {
  CLINIC_NAME,
  CLINIC_WORKING_HOURS,
  EMERGENCY_DISCLAIMER,
  SYSTEM_PROMPT,
  isDentalAppointmentQuery,
  isEmergencyQuery,
} from "../src/safety/system-prompt";

describe("System Prompt and Guardrails", () => {
  describe("Clinic Identity and Hours", () => {
    it("should state the clinic name in the system prompt", () => {
      expect(SYSTEM_PROMPT).toContain("BrightSmile Clinic");
      expect(CLINIC_NAME).toBe("BrightSmile Clinic");
    });

    it("should state clinic working hours (09:00 to 17:00)", () => {
      expect(SYSTEM_PROMPT).toContain("09:00");
      expect(SYSTEM_PROMPT).toContain("17:00");
      expect(CLINIC_WORKING_HOURS.start).toBe("09:00");
      expect(CLINIC_WORKING_HOURS.end).toBe("17:00");
    });
  });

  describe("Dental Services and Durations", () => {
    it("should define all 5 dental services with their codes, names, and durations", () => {
      // Service A: General Checkup & Cleaning - 60 minutes
      expect(SYSTEM_PROMPT).toMatch(/Service A/i);
      expect(SYSTEM_PROMPT).toMatch(/General Checkup & Cleaning/i);
      expect(SYSTEM_PROMPT).toMatch(/60\s*(?:min|minutes)/i);

      // Service B: Simple Tooth Extraction - 60 minutes
      expect(SYSTEM_PROMPT).toMatch(/Service B/i);
      expect(SYSTEM_PROMPT).toMatch(/Simple Tooth Extraction/i);

      // Service C: Root Canal Treatment - 150 minutes
      expect(SYSTEM_PROMPT).toMatch(/Service C/i);
      expect(SYSTEM_PROMPT).toMatch(/Root Canal Treatment/i);
      expect(SYSTEM_PROMPT).toMatch(/150\s*(?:min|minutes)/i);

      // Service D: Dental Crown / Veneer - 120 minutes
      expect(SYSTEM_PROMPT).toMatch(/Service D/i);
      expect(SYSTEM_PROMPT).toMatch(/Dental Crown \/ Veneer/i);
      expect(SYSTEM_PROMPT).toMatch(/120\s*(?:min|minutes)/i);

      // Service E: Full Mouth Implant Surgery - 360 minutes
      expect(SYSTEM_PROMPT).toMatch(/Service E/i);
      expect(SYSTEM_PROMPT).toMatch(/Full Mouth Implant Surgery/i);
      expect(SYSTEM_PROMPT).toMatch(/360\s*(?:min|minutes)/i);
    });
  });

  describe("Dentists and Qualification Enforcement", () => {
    it("should explicitly define all 3 dentists with their IDs and roles", () => {
      expect(SYSTEM_PROMPT).toContain("Junior");
      expect(SYSTEM_PROMPT).toContain("junior");
      expect(SYSTEM_PROMPT).toContain("Senior 1");
      expect(SYSTEM_PROMPT).toContain("senior-1");
      expect(SYSTEM_PROMPT).toContain("Senior 2");
      expect(SYSTEM_PROMPT).toContain("senior-2");
    });

    it("should strictly enforce that Junior can only perform Service A and B", () => {
      const promptLower = SYSTEM_PROMPT.toLowerCase();
      expect(promptLower).toContain("junior");
      // Verify junior can perform A and B
      expect(SYSTEM_PROMPT).toMatch(/Junior[\s\S]*(?:Service A|Service B|Services A and B)/i);
      // Verify qualification restriction that Junior CANNOT perform C, D, or E
      expect(SYSTEM_PROMPT).toMatch(
        /Junior[\s\S]*(?:cannot|only|restricted|not permitted|must not)[\s\S]*(?:Service C|Services C|C,\s*D|C and D)/i,
      );
    });

    it("should state that Services C, D, and E require Senior 1 or Senior 2", () => {
      expect(SYSTEM_PROMPT).toMatch(
        /(?:Senior 1|Senior 2|senior)[\s\S]*require[\s\S]*(?:Service C|C,\s*D|C, D, and E)/i,
      );
    });
  });

  describe("Scope Boundaries and Out-of-Scope Deflection", () => {
    it("should instruct the assistant to decline general chat, recipes, and financial advice", () => {
      const promptLower = SYSTEM_PROMPT.toLowerCase();
      expect(promptLower).toContain("recipe");
      expect(promptLower).toContain("financial advice");
      expect(promptLower).toContain("general chat");
    });

    it("should instruct the assistant to decline medical diagnoses and prescriptions", () => {
      const promptLower = SYSTEM_PROMPT.toLowerCase();
      expect(promptLower).toMatch(/medical diagnos/);
      expect(promptLower).toMatch(/prescrib/);
    });

    it("should classify dental vs out-of-scope user queries using isDentalAppointmentQuery", () => {
      // In-scope queries
      expect(isDentalAppointmentQuery("I want to book an appointment for teeth cleaning")).toBe(
        true,
      );
      expect(isDentalAppointmentQuery("Do you have available slots with Senior 1 tomorrow?")).toBe(
        true,
      );
      expect(isDentalAppointmentQuery("Can I reschedule my root canal treatment?")).toBe(true);
      expect(isDentalAppointmentQuery("What are the clinic opening hours?")).toBe(true);
      expect(isDentalAppointmentQuery("How much does a dental extraction take?")).toBe(true);
      expect(isDentalAppointmentQuery("I want to cancel appointment appt-123")).toBe(true);

      // Out-of-scope queries
      expect(isDentalAppointmentQuery("Can you give me a recipe for chocolate cake?")).toBe(false);
      expect(isDentalAppointmentQuery("What stock should I invest my retirement savings in?")).toBe(
        false,
      );
      expect(isDentalAppointmentQuery("Write a python script to implement quicksort")).toBe(false);
      expect(isDentalAppointmentQuery("What is the weather in Tokyo today?")).toBe(false);
      expect(isDentalAppointmentQuery("Tell me a funny joke about elephants")).toBe(false);
    });
  });

  describe("Emergency Healthcare Deflection", () => {
    it("should contain explicit guidance for severe swelling, uncontrollable bleeding, and breathing difficulty", () => {
      const promptLower = SYSTEM_PROMPT.toLowerCase();
      expect(promptLower).toContain("severe swelling");
      expect(promptLower).toContain("uncontrollable bleeding");
      expect(promptLower).toContain("breathing difficulty");
      expect(promptLower).toMatch(
        /(?:emergency room|emergency medical|urgent medical|call 911|er)/,
      );
    });

    it("should provide an emergency disclaimer constant", () => {
      expect(EMERGENCY_DISCLAIMER).toBeDefined();
      expect(EMERGENCY_DISCLAIMER.toLowerCase()).toContain("emergency");
      expect(EMERGENCY_DISCLAIMER.toLowerCase()).toMatch(/(?:swelling|bleeding|breathing)/);
    });

    it("should identify emergency symptoms using isEmergencyQuery", () => {
      expect(isEmergencyQuery("I have severe swelling in my face and breathing difficulty")).toBe(
        true,
      );
      expect(isEmergencyQuery("My gums are having uncontrollable bleeding after trauma")).toBe(
        true,
      );
      expect(isEmergencyQuery("Difficulty breathing and severe facial swelling")).toBe(true);

      // Non-emergency queries
      expect(isEmergencyQuery("I need to book a general checkup")).toBe(false);
      expect(isEmergencyQuery("I have a mild toothache when drinking tea")).toBe(false);
      expect(isEmergencyQuery("What times are open on Monday?")).toBe(false);
    });
  });

  describe("Tool Usage Discipline", () => {
    it("should enforce checking availability before offering slots", () => {
      const promptLower = SYSTEM_PROMPT.toLowerCase();
      expect(promptLower).toContain("check_availability");
      expect(promptLower).toMatch(/(?:never fabricate|never invent|never assume|always check)/);
    });

    it("should mandate collecting all required details before booking", () => {
      const promptLower = SYSTEM_PROMPT.toLowerCase();
      expect(promptLower).toContain("book_appointment");
      expect(promptLower).toMatch(/(?:patient\s*name|patientName)/i);
      expect(promptLower).toMatch(/(?:phone|patientPhone)/i);
    });
  });
});
