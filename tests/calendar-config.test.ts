import { describe, expect, it } from "bun:test";
import {
  getGoogleCalendarConfig,
  getOutlookCalendarConfig,
  type GoogleCalendarConfig,
  type OutlookCalendarConfig,
} from "../src/config/calendar";

describe("Calendar Configuration", () => {
  const validGoogleEnv = {
    GOOGLE_CLIENT_ID: "google-client-id-123",
    GOOGLE_CLIENT_SECRET: "google-secret-xyz",
    GOOGLE_REFRESH_TOKEN: "google-refresh-token-abc",
    GOOGLE_CALENDAR_JUNIOR: "junior-calendar@group.calendar.google.com",
    GOOGLE_CALENDAR_SENIOR_1: "senior1-calendar@group.calendar.google.com",
    GOOGLE_CALENDAR_SENIOR_2: "senior2-calendar@group.calendar.google.com",
  };

  const validOutlookEnv = {
    MICROSOFT_TENANT_ID: "tenant-id-456",
    MICROSOFT_CLIENT_ID: "ms-client-id-789",
    MICROSOFT_CLIENT_SECRET: "ms-secret-secret",
    MICROSOFT_REFRESH_TOKEN: "ms-refresh-token",
    MICROSOFT_CALENDAR_JUNIOR: "AAMkAGJuniorId=",
    MICROSOFT_CALENDAR_SENIOR_1: "AAMkAGSenior1Id=",
    MICROSOFT_CALENDAR_SENIOR_2: "AAMkAGSenior2Id=",
  };

  describe("getGoogleCalendarConfig", () => {
    it("parses valid Google Calendar environment configuration", () => {
      const config: GoogleCalendarConfig = getGoogleCalendarConfig(validGoogleEnv);

      expect(config.clientId).toBe("google-client-id-123");
      expect(config.clientSecret).toBe("google-secret-xyz");
      expect(config.refreshToken).toBe("google-refresh-token-abc");
      expect(config.calendarIds).toEqual({
        junior: "junior-calendar@group.calendar.google.com",
        "senior-1": "senior1-calendar@group.calendar.google.com",
        "senior-2": "senior2-calendar@group.calendar.google.com",
      });
    });

    it("does not fail when Microsoft environment variables are missing", () => {
      expect(() => getGoogleCalendarConfig(validGoogleEnv)).not.toThrow();
    });

    it("throws when a required Google variable is missing", () => {
      const envWithoutSecret = { ...validGoogleEnv };
      delete (envWithoutSecret as Record<string, string | undefined>).GOOGLE_CLIENT_SECRET;

      expect(() => getGoogleCalendarConfig(envWithoutSecret)).toThrow(/GOOGLE_CLIENT_SECRET/);
    });

    it("throws when a calendar mapping is empty string or whitespace", () => {
      const envWithEmptyCalendar = {
        ...validGoogleEnv,
        GOOGLE_CALENDAR_JUNIOR: "   ",
      };

      expect(() => getGoogleCalendarConfig(envWithEmptyCalendar)).toThrow(/GOOGLE_CALENDAR_JUNIOR/);
    });

    it("never includes secret values in thrown missing-variable error messages", () => {
      const env = {
        ...validGoogleEnv,
        GOOGLE_CALENDAR_SENIOR_2: "",
      };

      try {
        getGoogleCalendarConfig(env);
        expect.unreachable("should have thrown");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).toContain("GOOGLE_CALENDAR_SENIOR_2");
        expect(message).not.toContain("google-secret-xyz");
        expect(message).not.toContain("google-refresh-token-abc");
      }
    });
  });

  describe("getOutlookCalendarConfig", () => {
    it("parses valid Outlook / Microsoft Graph environment configuration", () => {
      const config: OutlookCalendarConfig = getOutlookCalendarConfig(validOutlookEnv);

      expect(config.tenantId).toBe("tenant-id-456");
      expect(config.clientId).toBe("ms-client-id-789");
      expect(config.clientSecret).toBe("ms-secret-secret");
      expect(config.refreshToken).toBe("ms-refresh-token");
      expect(config.calendarIds).toEqual({
        junior: "AAMkAGJuniorId=",
        "senior-1": "AAMkAGSenior1Id=",
        "senior-2": "AAMkAGSenior2Id=",
      });
    });

    it("does not fail when Google environment variables are missing", () => {
      expect(() => getOutlookCalendarConfig(validOutlookEnv)).not.toThrow();
    });

    it("throws when a required Microsoft variable is missing", () => {
      const envWithoutTenant = { ...validOutlookEnv };
      delete (envWithoutTenant as Record<string, string | undefined>).MICROSOFT_TENANT_ID;

      expect(() => getOutlookCalendarConfig(envWithoutTenant)).toThrow(/MICROSOFT_TENANT_ID/);
    });

    it("throws when a Microsoft calendar ID is missing", () => {
      const envWithoutSenior1 = { ...validOutlookEnv };
      delete (envWithoutSenior1 as Record<string, string | undefined>).MICROSOFT_CALENDAR_SENIOR_1;

      expect(() => getOutlookCalendarConfig(envWithoutSenior1)).toThrow(
        /MICROSOFT_CALENDAR_SENIOR_1/,
      );
    });
  });
});
