import { cookies } from "next/headers";
import { AdminAuthService } from "./admin-auth-service";
import { getAdminCookieName } from "../security/admin-cookie";
import {
  getRuntimeAdminSessionRepository,
  getRuntimeLoginAttemptRepository,
} from "../repository/runtime-repositories";

export type AdminServerSession = { username: string };

/**
 * Server-only session lookup for protected pages. Missing configuration, an
 * absent database URL, or any repository failure resolves to unauthenticated
 * so pages redirect instead of rendering an error.
 */
export async function readAdminSession(
  env: Record<string, string | undefined> = process.env,
): Promise<AdminServerSession | null> {
  if (!env.DATABASE_URL && !env.POSTGRES_URL) {
    return null;
  }

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(getAdminCookieName(env))?.value;
    if (!token) {
      return null;
    }

    const auth = new AdminAuthService({
      sessionRepository: getRuntimeAdminSessionRepository(),
      attemptRepository: getRuntimeLoginAttemptRepository(),
      env,
    });

    return await auth.validate(token);
  } catch {
    return null;
  }
}
