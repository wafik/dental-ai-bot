import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminMutationGuard } from "@/security/admin-guard";
import {
  getRuntimeSecretRepository,
  getRuntimeSettingsRepository,
} from "@/repository/runtime-repositories";
import type { SecretRepository } from "@/repository/secret-repository";
import type { SettingsRepository } from "@/repository/settings-repository";
import type { AdminSettingsView } from "@/domain/admin-settings";
import type { AdminAuthService } from "@/services/admin-auth-service";
import {
  authenticateAdminRequest,
  createDefaultAdminAuthService,
  readAdminSettings,
  updateAdminSettings,
} from "@/services/admin-settings-service";

export type AdminSettingsRouteDeps = {
  authService?: AdminAuthService;
  settingsRepository?: SettingsRepository;
  secretRepository?: SecretRepository;
  env?: Record<string, string | undefined>;
};

const endpointSchema = z.object({
  baseUrl: z.string().trim().max(512),
  model: z.string().trim().max(128),
});

const updateSchema = z.object({
  calendarProvider: z.enum(["none", "google", "outlook"]),
  dentistMappings: z
    .array(
      z.object({
        dentistId: z.enum(["junior", "senior-1", "senior-2"]),
        provider: z.enum(["google", "outlook"]),
        // An empty calendar ID is how the operator clears a mapping; the
        // runtime resolver treats blank entries as "not configured".
        calendarId: z.string().trim().max(512),
      }),
    )
    .max(6),
  // A blank value means "keep using the environment or the default".
  ai: endpointSchema.optional(),
  secrets: z.record(z.string(), z.string().max(8192)).optional(),
});

export function createAdminSettingsHandlers(deps: AdminSettingsRouteDeps = {}) {
  const resolveDeps = () => {
    const env = deps.env ?? process.env;
    return {
      env,
      authService: deps.authService ?? createDefaultAdminAuthService(env),
      settingsRepository: deps.settingsRepository ?? getRuntimeSettingsRepository(),
      secretRepository: deps.secretRepository ?? getRuntimeSecretRepository(),
    };
  };

  const GET = async function GET(request: Request): Promise<Response> {
    try {
      const resolved = resolveDeps();
      const auth = await authenticateAdminRequest(request, {
        authService: resolved.authService,
        env: resolved.env,
      });
      if (!auth.ok) {
        return auth.response;
      }

      const settings = await readAdminSettings({
        settingsRepository: resolved.settingsRepository,
        secretRepository: resolved.secretRepository,
        env: resolved.env,
      });

      return jsonNoStore({ success: true, settings }, 200);
    } catch {
      return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
  };

  const PUT = async function PUT(request: Request): Promise<Response> {
    try {
      const resolved = resolveDeps();

      // CSRF check precedes body parsing and authentication so forged requests
      // can never trigger parsing work or reveal session state.
      if (!requireAdminMutationGuard(request, resolved.env)) {
        return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
      }

      const auth = await authenticateAdminRequest(request, {
        authService: resolved.authService,
        env: resolved.env,
      });
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

      const parsed = updateSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Invalid settings payload" },
          { status: 400 },
        );
      }

      const settings = await updateAdminSettings(
        {
          settingsRepository: resolved.settingsRepository,
          secretRepository: resolved.secretRepository,
          env: resolved.env,
        },
        parsed.data,
      );

      return jsonNoStore({ success: true, settings }, 200);
    } catch {
      return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
  };

  return { GET, PUT };
}

function jsonNoStore(payload: { success: true; settings: AdminSettingsView }, status: number) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

const defaultHandlers = createAdminSettingsHandlers();
export const GET = defaultHandlers.GET;
export const PUT = defaultHandlers.PUT;
