import { defineConfig, devices } from "@playwright/test";

const E2E_ENV = {
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54999/dental_e2e",
  ADMIN_USERNAME: "e2e-admin",
  ADMIN_PASSWORD_HASH:
    "scrypt:Y400ZIOW0lcTCdfuNt/QoA==:/BVdY+LdU5Dp3skTC16xj8AXeDDQwS9VuaX4R/AUamqx24CFwPgFVXX18yv5NuCPdUctfq0URKJJSSo4Uoj7WQ==",
  SETTINGS_ENCRYPTION_KEY: "e6ec3e841d17e2971d35616c1341c9cabc151e4d538b1842eec4f2d064361262",
  APP_BASE_URL: "http://127.0.0.1:3000",
  CALENDAR_PROVIDER: "none",
  OPENAI_API_KEY: "test-openai-key",
  CLINIC_TIMEZONE: "Asia/Jakarta",
};

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.e2e\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "bun scripts/e2e-server.ts",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
    timeout: 180 * 1000,
    env: E2E_ENV,
  },
  globalTeardown: "./scripts/e2e-teardown.ts",
});
