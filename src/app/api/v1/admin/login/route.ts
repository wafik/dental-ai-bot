import { NextResponse } from "next/server";
import { z } from "zod";
import { buildSessionCookie } from "@/security/admin-cookie";
import { requireAdminMutationGuard } from "@/security/admin-guard";
import type { AdminAuthService } from "@/services/admin-auth-service";
import { createDefaultAdminAuthService } from "@/services/admin-settings-service";

export type AdminLoginRouteDeps = {
  authService?: AdminAuthService;
  env?: Record<string, string | undefined>;
};

const loginSchema = z.object({
  username: z.string().min(1).max(128),
  password: z.string().min(1).max(1024),
});

const INVALID_CREDENTIALS_MESSAGE = "Invalid username or password.";
const THROTTLE_RETRY_SECONDS = "900";

export function createAdminLoginHandler(deps: AdminLoginRouteDeps = {}) {
  return async function POST(request: Request): Promise<Response> {
    const env = deps.env ?? process.env;

    // CSRF guard runs before the body is read so forged posts do nothing.
    if (!requireAdminMutationGuard(request, env)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
    }

    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
    }

    try {
      const authService = deps.authService ?? createDefaultAdminAuthService(env);
      const result = await authService.login(parsed.data);

      if (result.ok) {
        const response = NextResponse.json(
          { success: true, username: parsed.data.username },
          { status: 200 },
        );
        response.headers.append(
          "Set-Cookie",
          buildSessionCookie(result.token, result.expiresAtMs, env),
        );
        return response;
      }

      if (result.error === "RATE_LIMITED") {
        return NextResponse.json(
          { success: false, error: INVALID_CREDENTIALS_MESSAGE },
          { status: 429, headers: { "Retry-After": THROTTLE_RETRY_SECONDS } },
        );
      }

      if (result.error === "NOT_CONFIGURED") {
        return NextResponse.json(
          { success: false, error: "Admin login is not configured." },
          { status: 503 },
        );
      }

      return NextResponse.json(
        { success: false, error: INVALID_CREDENTIALS_MESSAGE },
        { status: 401 },
      );
    } catch {
      return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
  };
}

export const POST = createAdminLoginHandler();
