export type ClinicSettingRecord = {
  key: string;
  value: string;
  description?: string;
  updatedAt: string;
};

export type DentistCalendarMappingRecord = {
  id: string;
  dentistId: string;
  provider: "google" | "outlook";
  calendarId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UpsertDentistCalendarMappingInput = {
  dentistId: string;
  provider: "google" | "outlook";
  calendarId: string;
  isActive?: boolean;
};

/**
 * Repository interface for clinic settings and dentist calendar mappings.
 */
export type SettingsRepository = {
  /**
   * Retrieves a setting value by key.
   */
  getSetting(key: string): Promise<string | null>;

  /**
   * Sets or updates a setting value.
   */
  setSetting(key: string, value: string, description?: string): Promise<void>;

  /**
   * Gets all active dentist calendar mappings, optionally filtered by provider.
   */
  getDentistCalendarMappings(
    provider?: "google" | "outlook",
  ): Promise<DentistCalendarMappingRecord[]>;

  /**
   * Gets every mapping including inactive rows, for admin display.
   */
  getAllDentistCalendarMappings(): Promise<DentistCalendarMappingRecord[]>;

  /**
   * Creates or updates a dentist calendar mapping.
   */
  upsertDentistCalendarMapping(
    input: UpsertDentistCalendarMappingInput,
  ): Promise<DentistCalendarMappingRecord>;
};
