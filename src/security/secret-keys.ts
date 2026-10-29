export const SECRET_KEYS = {
  openaiApiKey: "openai.apiKey",
  googleClientId: "google.clientId",
  googleClientSecret: "google.clientSecret",
  googleRefreshToken: "google.refreshToken",
  googleServiceAccountEmail: "google.serviceAccountEmail",
  googleServiceAccountPrivateKey: "google.serviceAccountPrivateKey",
  microsoftTenantId: "microsoft.tenantId",
  microsoftClientId: "microsoft.clientId",
  microsoftClientSecret: "microsoft.clientSecret",
  microsoftRefreshToken: "microsoft.refreshToken",
} as const;

export type SecretKey = (typeof SECRET_KEYS)[keyof typeof SECRET_KEYS];

export const ALL_SECRET_KEYS: SecretKey[] = Object.values(SECRET_KEYS);

export const ENV_FALLBACK_KEYS: Record<SecretKey, string> = {
  "openai.apiKey": "OPENAI_API_KEY",
  "google.clientId": "GOOGLE_CLIENT_ID",
  "google.clientSecret": "GOOGLE_CLIENT_SECRET",
  "google.refreshToken": "GOOGLE_REFRESH_TOKEN",
  "google.serviceAccountEmail": "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "google.serviceAccountPrivateKey": "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
  "microsoft.tenantId": "MICROSOFT_TENANT_ID",
  "microsoft.clientId": "MICROSOFT_CLIENT_ID",
  "microsoft.clientSecret": "MICROSOFT_CLIENT_SECRET",
  "microsoft.refreshToken": "MICROSOFT_REFRESH_TOKEN",
};
