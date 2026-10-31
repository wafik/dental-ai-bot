import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test.describe("Dental Clinic AI Receptionist - E2E User Journey", () => {
  test.beforeAll(async () => {
    const dir = path.join(process.cwd(), "docs", "screenshots");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  test("loads dental clinic portal and captures high-resolution screenshots of all views", async ({
    page,
  }) => {
    // 1. Visit homepage
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // 2. Verify clinic branding & title
    await expect(page.locator("h1")).toContainText("BrightSmile Dental Clinic");
    await expect(page.locator("body")).toContainText("AI Receptionist Ready");

    // Take screenshot of main landing page with AI Chat tab
    await page.screenshot({
      path: "docs/screenshots/01-ai-chat-portal.png",
      fullPage: true,
    });

    // 3. Navigate to Conversational Voice Call tab
    const voiceButton = page.getByRole("button", { name: /Conversational Voice Call/i });
    await expect(voiceButton).toBeVisible();
    await voiceButton.click();

    await expect(page.locator("body")).toContainText("Two-way natural voice call");
    await expect(page.getByRole("button", { name: /Start Voice Call/i })).toBeVisible();

    await page.screenshot({
      path: "docs/screenshots/02-voice-call-widget.png",
      fullPage: true,
    });

    // 4. Navigate to Dentist Schedules tab
    const scheduleButton = page.getByRole("button", { name: /Dentist Schedules/i });
    await expect(scheduleButton).toBeVisible();
    await scheduleButton.click();

    await expect(page.locator("body")).toContainText("Dr. Junior");
    await expect(page.locator("body")).toContainText("Dr. Senior 1");
    await expect(page.locator("body")).toContainText("Dr. Senior 2");
    await expect(page.locator("body")).toContainText("09:00 – 17:00");

    await page.screenshot({
      path: "docs/screenshots/03-dentist-schedules.png",
      fullPage: true,
    });

    // 5. Navigate to Dental Services tab
    const servicesButton = page.getByRole("button", { name: /Dental Services/i });
    await expect(servicesButton).toBeVisible();
    await servicesButton.click();

    await expect(page.locator("body")).toContainText("General Checkup & Cleaning");
    await expect(page.locator("body")).toContainText("Simple Tooth Extraction");
    await expect(page.locator("body")).toContainText("Root Canal Treatment");
    await expect(page.locator("body")).toContainText("Dental Crown / Veneer");
    await expect(page.locator("body")).toContainText("Full Mouth Implant Surgery");

    await page.screenshot({
      path: "docs/screenshots/04-services-catalog.png",
      fullPage: true,
    });
  });

  test("verifies schedule matrix reacts to date picker changes and refresh action", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const scheduleButton = page.getByRole("button", { name: /Dentist Schedules/i });
    await scheduleButton.click();

    // Verify date picker input exists
    const dateInput = page.locator('input[type="date"]');
    await expect(dateInput).toBeVisible();

    // Change date
    await dateInput.fill("2026-10-29");

    // Click refresh button
    const refreshBtn = page.getByRole("button", { name: /Refresh/i });
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click();

    // Ensure all 3 doctor cards remain rendered and interactive
    await expect(page.locator("text=Dr. Junior")).toBeVisible();
    await expect(page.locator("text=Dr. Senior 1")).toBeVisible();
    await expect(page.locator("text=Dr. Senior 2")).toBeVisible();
  });
});
