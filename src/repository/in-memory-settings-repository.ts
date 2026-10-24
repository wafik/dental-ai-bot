import { randomUUID } from "node:crypto";
import type {
  ClinicSettingRecord,
  DentistCalendarMappingRecord,
  SettingsRepository,
  UpsertDentistCalendarMappingInput,
} from "./settings-repository";

/**
 * In-memory implementation of SettingsRepository for testing and mock runs.
 */
export class InMemorySettingsRepository implements SettingsRepository {
  private readonly settings = new Map<string, ClinicSettingRecord>();
  private readonly mappings = new Map<string, DentistCalendarMappingRecord>();

  async getSetting(key: string): Promise<string | null> {
    const record = this.settings.get(key);
    return record?.value ?? null;
  }

  async setSetting(key: string, value: string, description?: string): Promise<void> {
    const now = new Date().toISOString();
    this.settings.set(key, {
      key,
      value,
      description,
      updatedAt: now,
    });
  }

  async getDentistCalendarMappings(
    provider?: "google" | "outlook",
  ): Promise<DentistCalendarMappingRecord[]> {
    const results: DentistCalendarMappingRecord[] = [];
    for (const record of this.mappings.values()) {
      if (!record.isActive) {
        continue;
      }
      if (provider && record.provider !== provider) {
        continue;
      }
      results.push({ ...record });
    }
    return results;
  }

  async upsertDentistCalendarMapping(
    input: UpsertDentistCalendarMappingInput,
  ): Promise<DentistCalendarMappingRecord> {
    const now = new Date().toISOString();

    // Find existing by composite match
    let foundId: string | undefined;
    for (const [id, mapping] of this.mappings.entries()) {
      if (mapping.provider === input.provider && mapping.dentistId === input.dentistId) {
        foundId = id;
        break;
      }
    }

    if (foundId) {
      const existing = this.mappings.get(foundId)!;
      const updated: DentistCalendarMappingRecord = {
        ...existing,
        calendarId: input.calendarId,
        isActive: input.isActive ?? existing.isActive,
        updatedAt: now,
      };
      this.mappings.set(foundId, updated);
      return { ...updated };
    }

    const id = randomUUID();
    const newRecord: DentistCalendarMappingRecord = {
      id,
      dentistId: input.dentistId,
      provider: input.provider,
      calendarId: input.calendarId,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.mappings.set(id, newRecord);
    return { ...newRecord };
  }
}
