import { expect, test } from "@playwright/test";

const USERNAME = "e2e-admin";
const PASSWORD = "E2E-Admin-Password-123!";
const DRAFT_SECRET = "sk-e2e-draft-secret-do-not-persist-123";

test.describe("Admin settings", () => {
  test.beforeEach(async () => {
    // Each test starts unauthenticated.
  });

  test("denies unauthenticated access and rejects bad credentials", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);

    await page.getByLabel("Username").fill(USERNAME);
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.getByText("Invalid username or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("logs in, saves draft settings, keeps secrets write-only, and logs out", async ({
    page,
  }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Username").fill(USERNAME);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText("BrightSmile Admin")).toBeVisible();

    // Provider and mapping. Saving stays disabled until the stored settings
    // load, which is what guarantees these edits are not overwritten.
    await expect(page.getByTestId("save-settings")).toBeEnabled();
    await page.getByRole("tab", { name: "Calendar" }).click();
    await page.locator("#calendar-provider").selectOption("both");
    await page
      .locator("#mapping-junior-googleCalendarId")
      .fill("junior-e2e@group.calendar.google.com");
    await page.locator("#mapping-junior-outlookCalendarId").fill("junior-e2e@outlook.example");

    // Draft secret + eye toggle
    await page.getByRole("tab", { name: "Credentials" }).click();
    const openAiInput = page.getByLabel("API Key");
    await openAiInput.fill(DRAFT_SECRET);
    await expect(openAiInput).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Show value" }).first().click();
    await expect(openAiInput).toHaveAttribute("type", "text");
    await expect(openAiInput).toHaveValue(DRAFT_SECRET);

    await page.getByRole("button", { name: "Hide value" }).first().click();
    await expect(openAiInput).toHaveAttribute("type", "password");

    // The endpoint and model are plain settings, prefilled from the environment.
    await page.locator("#ai-baseUrl").fill("https://proxy.e2e.test/v1");
    await page.locator("#ai-model").fill("e2e-model");

    const saveResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/admin/settings") && response.request().method() === "PUT",
    );
    await page.getByTestId("save-settings").click();
    const response = await saveResponse;
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body).not.toContain(DRAFT_SECRET);

    // After save the draft is cleared and the value is write-only.
    await expect(openAiInput).toHaveValue("");
    await expect(page.getByTestId("status-openai")).toContainText("Configured");

    // Reload persists configuration but never returns the secret.
    await page.reload();
    await expect(page.getByTestId("status-openai")).toContainText("Configured");
    await page.getByRole("tab", { name: "Calendar" }).click();
    await expect(page.locator("#calendar-provider")).toHaveValue("both");
    await expect(page.locator("#mapping-junior-googleCalendarId")).toHaveValue(
      "junior-e2e@group.calendar.google.com",
    );
    await expect(page.locator("#mapping-junior-outlookCalendarId")).toHaveValue(
      "junior-e2e@outlook.example",
    );
    await page.getByRole("tab", { name: "Credentials" }).click();
    await expect(page.getByLabel("API Key")).toHaveValue("");
    await expect(page.getByRole("button", { name: "Show value" })).toHaveCount(0);
    await expect(page.locator("#ai-baseUrl")).toHaveValue("https://proxy.e2e.test/v1");
    await expect(page.locator("#ai-model")).toHaveValue("e2e-model");

    // Logout revokes access.
    await page.getByTestId("logout").click();
    await expect(page).toHaveURL(/\/admin\/login$/);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("loads a Google service-account key JSON into drafts and saves it encrypted", async ({
    page,
  }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Username").fill(USERNAME);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByTestId("save-settings")).toBeEnabled();
    await page.getByRole("tab", { name: "Credentials" }).click();

    // A file picker feeds the two service-account drafts from the browser.
    await page.getByTestId("google-key-file").setInputFiles({
      name: "key.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          type: "service_account",
          project_id: "e2e-project",
          private_key: "-----BEGIN PRIVATE KEY-----\nE2EKEY\n-----END PRIVATE KEY-----\n",
          client_email: "e2e-runner@e2e-project.iam.gserviceaccount.com",
        }),
      ),
    });

    const emailInput = page.locator("#secret-google-serviceAccountEmail");
    const keyInput = page.locator("#secret-google-serviceAccountPrivateKey");
    await expect(emailInput).toHaveValue("e2e-runner@e2e-project.iam.gserviceaccount.com");
    await expect(keyInput).toHaveValue(/BEGIN PRIVATE KEY/);
    await expect(page.getByText("Key JSON loaded into the fields below.")).toBeVisible();

    // Both drafts stay masked until save.
    await expect(emailInput).toHaveAttribute("type", "password");
    await expect(keyInput).toHaveAttribute("type", "password");

    const saveResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/admin/settings") && response.request().method() === "PUT",
    );
    await page.getByTestId("save-settings").click();
    const response = await saveResponse;
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).not.toContain("e2e-runner@e2e-project.iam.gserviceaccount.com");
    expect(body).not.toContain("E2EKEY");

    // Drafts clear; the stored values are only reported as configured.
    await expect(emailInput).toHaveValue("");
    await expect(keyInput).toHaveValue("");
    await page.reload();
    await expect(page.getByTestId("status-google")).toContainText("Configured");
    await page.getByRole("tab", { name: "Credentials" }).click();
    await expect(page.locator("#secret-google-serviceAccountEmail")).toHaveValue("");
    await expect(page.getByText("Configured")).not.toHaveCount(0);
  });

  test("rejects a file that is not a service-account key", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Username").fill(USERNAME);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.getByRole("tab", { name: "Credentials" }).click();

    await page.getByTestId("google-key-file").setInputFiles({
      name: "notes.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ hello: "world" })),
    });

    await expect(
      page.getByText("That file is not a Google service-account key JSON."),
    ).toBeVisible();
    await expect(page.locator("#secret-google-serviceAccountEmail")).toHaveValue("");
  });
});
