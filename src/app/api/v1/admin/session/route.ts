import { NextResponse } from "next/server";
import type { AdminAuthService } from "@/services/admin-auth-service";
import {
  authenticateAdminRequest,
  createDefaultAdminAuthService,
} from "@/services/admin-settings-service";

export type AdminSessionRouteDeps = {
  authService?: AdminAuthService;
  env?: Record<string, string | undefined>;
};

export function createAdminSessionHandler(deps: AdminSessionRouteDeps = {}) {
  return async function GET(request: Request): Promise<Response> {
    const env = deps.env ?? process.env;

    try {
      const authService = deps.authService ?? createDefaultAdminAuthService(env);
      const auth = await authenticateAdminRequest(request, { authService, env });

      if (!auth.ok) {
        // Read-only probe: report signed-out rather than an error status.
        return NextResponse.json(
          { success: true, authenticated: false },
          { status: 200, headers: { "Cache-Control": "no-store" } },
        );
      }

      return NextResponse.json(
        { success: true, authenticated: true, username: auth.username },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
  };
}

export const GET = createAdminSessionHandler();
