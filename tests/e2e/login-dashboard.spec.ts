import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// The phone bar's labels come from the message file (Home, Plan, Journal, Review, AI Coach), so a renamed label does not
// need this test edited. tests/unit/playwright-config.test.tsx checks the shell renders these five.
// The path is relative to this file, not to the folder Playwright was started from.
const en = JSON.parse(readFileSync(new URL("../../src/messages/en.json", import.meta.url), "utf8")) as {
  nav: { dashboard: string; plans: string; journal: string; reviews: string; ai: string };
};

test("demo user can login and see dashboard", async ({ page }) => {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill("demo@nazm.example");
  await page.getByLabel("Password").fill("DemoPassword123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/en\/dashboard/);
  await expect(page.getByRole("heading", { name: "Am I ready to trade today?" })).toBeVisible();
});

test("demo user can create a trade", async ({ page }) => {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill("demo@nazm.example");
  await page.getByLabel("Password").fill("DemoPassword123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard/);

  await page.goto("/en/journal");
  await page.getByRole("button", { name: "Create trade" }).click();
  await expect(page.getByRole("button", { name: /BTCUSDT/ }).first()).toBeVisible();
});

test("mobile shell keeps five primary actions and exposes secondary tools under More", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile navigation acceptance check");

  await page.goto("/en/login");
  await page.getByLabel("Email").fill("demo@nazm.example");
  await page.getByLabel("Password").fill("DemoPassword123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard/);

  const primaryNav = page.locator('nav[aria-label="Primary navigation"]:visible');
  await expect(primaryNav.getByRole("link")).toHaveCount(5);
  await expect(primaryNav.getByRole("link").allTextContents()).resolves.toEqual([
    en.nav.dashboard,
    en.nav.plans,
    en.nav.journal,
    en.nav.reviews,
    en.nav.ai
  ]);

  await page.locator('summary[aria-label="More"]').click();
  await expect(page.getByRole("link", { name: "Strategies" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();

  // Choosing a destination closes the menu instead of leaving it over the new page.
  await page.getByRole("link", { name: "Strategies" }).click();
  await expect(page).toHaveURL(/\/en\/strategies/);
  await expect(page.getByRole("link", { name: "Settings" })).toBeHidden();
});
