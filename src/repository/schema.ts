import { boolean, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * PostgreSQL appointments table schema defined via Drizzle ORM.
 */
export const appointments = pgTable("appointments", {
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
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "string" }),
});

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
