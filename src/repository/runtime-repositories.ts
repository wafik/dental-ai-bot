import type { AdminSessionRepository } from "./admin-session-repository";
import type { AppointmentRepository } from "./appointment-repository";
import type { LoginAttemptRepository } from "./login-attempt-repository";
import type { SecretRepository } from "./secret-repository";
import type { SettingsRepository } from "./settings-repository";
import { DrizzleAdminSessionRepository } from "./drizzle-admin-session-repository";
import { DrizzleAppointmentRepository } from "./drizzle-appointment-repository";
import { DrizzleLoginAttemptRepository } from "./drizzle-login-attempt-repository";
import { DrizzleSecretRepository } from "./drizzle-secret-repository";
import { DrizzleSettingsRepository } from "./drizzle-settings-repository";

/**
 * Stateless repositories safe to reuse across requests. Credential values are
 * read per call, so admin changes take effect without restarting.
 */
let settingsRepository: SettingsRepository | null = null;
let secretRepository: SecretRepository | null = null;
let appointmentRepository: AppointmentRepository | null = null;
let adminSessionRepository: AdminSessionRepository | null = null;
let loginAttemptRepository: LoginAttemptRepository | null = null;

export function getRuntimeSettingsRepository(): SettingsRepository {
  settingsRepository ??= new DrizzleSettingsRepository();
  return settingsRepository;
}

export function getRuntimeSecretRepository(): SecretRepository {
  secretRepository ??= new DrizzleSecretRepository();
  return secretRepository;
}

export function getRuntimeAppointmentRepository(): AppointmentRepository {
  appointmentRepository ??= new DrizzleAppointmentRepository();
  return appointmentRepository;
}

export function getRuntimeAdminSessionRepository(): AdminSessionRepository {
  adminSessionRepository ??= new DrizzleAdminSessionRepository();
  return adminSessionRepository;
}

export function getRuntimeLoginAttemptRepository(): LoginAttemptRepository {
  loginAttemptRepository ??= new DrizzleLoginAttemptRepository();
  return loginAttemptRepository;
}
