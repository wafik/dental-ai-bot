import { boolean, index, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * PostgreSQL appointments table schema defined via Drizzle ORM.
 */
export const appointments = pgTable(
  "appointments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    patientName: text("patient_name").notNull(),
    patientPhone: varchar("patient_phone", { length: 32 }).notNull(),
    serviceCode: varchar("service_code", { length: 8 }).notNull(),
    dentistId: varchar("dentist_id", { length: 32 }).notNull(),
    date: varchar("date", { length: 10 }).notNull(),
    startTime: varchar("start_time", { length: 5 }).notNull(),
    endTime: varchar("end_time", { length: 5 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("confirmed"),
    calendarEventId: text("calendar_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    index("appointments_dentist_date_status_idx").on(table.dentistId, table.date, table.status),
  ],
);

export type AppointmentRow = typeof appointments.$inferSelect;
export type InsertAppointmentRow = typeof appointments.$inferInsert;

/**
 * PostgreSQL clinic dynamic configuration settings table.
 * Used for storing operational settings (e.g. active calendar provider, working hours).
 */
export const clinicSettings = pgTable("clinic_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export type ClinicSettingRow = typeof clinicSettings.$inferSelect;
export type InsertClinicSettingRow = typeof clinicSettings.$inferInsert;

/**
 * PostgreSQL dentist calendar mapping table.
 * Maps dentists to their specific Google or Outlook calendar IDs.
 */
export const dentistCalendarMappings = pgTable("dentist_calendar_mappings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  dentistId: varchar("dentist_id", { length: 32 }).notNull(),
  provider: varchar("provider", { length: 16 }).notNull(), // "google" | "outlook"
  calendarId: text("calendar_id").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export type DentistCalendarMappingRow = typeof dentistCalendarMappings.$inferSelect;
export type InsertDentistCalendarMappingRow = typeof dentistCalendarMappings.$inferInsert;

/**
 * Encrypted third-party credentials (OpenAI, Google, Microsoft).
 * Values are AES-256-GCM encrypted with a key held outside the database.
 */
export const encryptedSecrets = pgTable("encrypted_secrets", {
  key: varchar("key", { length: 64 }).primaryKey(),
  ciphertext: text("ciphertext").notNull(),
  iv: varchar("iv", { length: 32 }).notNull(),
  authTag: varchar("auth_tag", { length: 32 }).notNull(),
  keyVersion: varchar("key_version", { length: 16 }).notNull().default("v1"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export type EncryptedSecretRow = typeof encryptedSecrets.$inferSelect;
export type InsertEncryptedSecretRow = typeof encryptedSecrets.$inferInsert;

/**
 * Admin sessions. Only SHA-256 hashes of opaque tokens are stored.
 */
export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    username: varchar("username", { length: 128 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (table) => [
    index("admin_sessions_token_hash_idx").on(table.tokenHash),
    index("admin_sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export type AdminSessionRow = typeof adminSessions.$inferSelect;
export type InsertAdminSessionRow = typeof adminSessions.$inferInsert;

/**
 * Failed admin login attempts, used for persistent account-level throttling.
 */
export const adminLoginAttempts = pgTable(
  "admin_login_attempts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    identifier: varchar("identifier", { length: 128 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("admin_login_attempts_identifier_idx").on(table.identifier, table.createdAt)],
);

export type AdminLoginAttemptRow = typeof adminLoginAttempts.$inferSelect;
export type InsertAdminLoginAttemptRow = typeof adminLoginAttempts.$inferInsert;
