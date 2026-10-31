import { NextResponse } from "next/server";
import { buildClearSessionCookie, readSessionToken } from "@/security/admin-cookie";
import { requireAdminMutationGuard } from "@/security/admin-guard";
import type { AdminAuthService } from "@/services/admin-auth-service";
import { createDefaultAdminAuthService } from "@/services/admin-settings-service";

export type AdminLogoutRouteDeps = {
  authService?: AdminAuthService;
  env?: Record<string, string | undefined>;
};

export function createAdminLogoutHandler(deps: AdminLogoutRouteDeps = {}) {
  return async function POST(request: Request): Promise<Response> {
    const env = deps.env ?? process.env;

    if (!requireAdminMutationGuard(request, env)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    try {
      // Revocation is best-effort: the browser cookie must be cleared either
      // way so a stale token cannot keep the UI signed in.
      const token = readSessionToken(request, env);
      if (token) {
        const authService = deps.authService ?? createDefaultAdminAuthService(env);
        await authService.logout(token);
      }
    } catch {
      // Never surface session-store failures to the client.
    }

    const response = NextResponse.json({ success: true }, { status: 200 });
    response.headers.append("Set-Cookie", buildClearSessionCookie(env));
    return response;
  };
}

export const POST = createAdminLogoutHandler();
