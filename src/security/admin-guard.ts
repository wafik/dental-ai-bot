type GuardEnv = Record<string, string | undefined>;

/**
 * Rejects state-changing admin requests that do not originate from the app.
 */
export function isSameOrigin(request: Request, env: GuardEnv = process.env): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    return false;
  }

  let expected: string;
  try {
    expected = env.APP_BASE_URL ? new URL(env.APP_BASE_URL).origin : new URL(request.url).origin;
  } catch {
    return false;
  }

  return origin === expected;
}

/**
 * Standard HTML form posts cannot attach this custom header.
 */
export function hasAdminActionHeader(request: Request): boolean {
  return request.headers.get("x-admin-action") === "1";
}

export function requireAdminMutationGuard(request: Request, env: GuardEnv = process.env): boolean {
  return isSameOrigin(request, env) && hasAdminActionHeader(request);
}
