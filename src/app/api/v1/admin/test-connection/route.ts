import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminMutationGuard } from "@/security/admin-guard";
import { getRuntimeSecretRepository } from "@/repository/runtime-repositories";
import type { SecretRepository } from "@/repository/secret-repository";
import type { AdminAuthService } from "@/services/admin-auth-service";
import {
  authenticateAdminRequest,
  createDefaultAdminAuthService,
} from "@/services/admin-settings-service";
import { testConnection, type ConnectionTestResult } from "@/services/connection-test-service";

export type AdminTestConnectionRouteDeps = {
  authService?: AdminAuthService;
  secretRepository?: SecretRepository;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
};

const testSchema = z.object({
  provider: z.enum(["openai", "google", "microsoft"]),
  draft: z.record(z.string(), z.string().max(8192)).optional(),
});

export function createAdminTestConnectionHandler(deps: AdminTestConnectionRouteDeps = {}) {
  return async function POST(request: Request): Promise<Response> {
    try {
      const env = deps.env ?? process.env;

      if (!requireAdminMutationGuard(request, env)) {
        return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
      }

      const authService = deps.authService ?? createDefaultAdminAuthService(env);
      const auth = await authenticateAdminRequest(request, { authService, env });
      if (!auth.ok) {
        return auth.response;
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { success: false, error: "Invalid request body" },
          { status: 400 },
        );
      }

      const parsed = testSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Invalid request body" },
          { status: 400 },
        );
      }

      const secretRepository = deps.secretRepository ?? getRuntimeSecretRepository();
      const result: ConnectionTestResult = await testConnection(
        {
          secretRepository,
          env,
          ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
        },
        parsed.data.provider,
        parsed.data.draft,
      );

      // A failed provider probe is a valid test outcome, not an HTTP error.
      return NextResponse.json({ success: true, result }, { status: 200 });
    } catch {
      return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
  };
}

export const POST = createAdminTestConnectionHandler();
