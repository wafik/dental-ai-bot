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
    await page.locator("#calendar-provider").selectOption("google");
    await page.locator("#mapping-junior-calendar").fill("junior-e2e@group.calendar.google.com");

    // Draft secret + eye toggle
    const openAiInput = page.getByLabel("API Key");
    await openAiInput.fill(DRAFT_SECRET);
    await expect(openAiInput).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Show value" }).first().click();
    await expect(openAiInput).toHaveAttribute("type", "text");
    await expect(openAiInput).toHaveValue(DRAFT_SECRET);

    await page.getByRole("button", { name: "Hide value" }).first().click();
    await expect(openAiInput).toHaveAttribute("type", "password");

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
    await expect(page.locator("#calendar-provider")).toHaveValue("google");
    await expect(page.locator("#mapping-junior-calendar")).toHaveValue(
      "junior-e2e@group.calendar.google.com",
    );
    await expect(page.getByTestId("status-openai")).toContainText("Configured");
    await expect(page.getByLabel("API Key")).toHaveValue("");
    await expect(page.getByRole("button", { name: "Show value" })).toHaveCount(0);

    // Logout revokes access.
    await page.getByTestId("logout").click();
    await expect(page).toHaveURL(/\/admin\/login$/);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });
});
