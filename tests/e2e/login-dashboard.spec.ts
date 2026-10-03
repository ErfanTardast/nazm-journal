import { expect, test } from "@playwright/test";

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
  await expect(primaryNav.getByRole("link").allTextContents()).resolves.toEqual(["Home", "Plan", "Journal", "Review", "AI"]);

  await page.locator('summary[aria-label="More"]').click();
  await expect(page.getByRole("link", { name: "Strategies" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();

  // Choosing a destination closes the menu instead of leaving it over the new page.
  await page.getByRole("link", { name: "Strategies" }).click();
  await expect(page).toHaveURL(/\/en\/strategies/);
  await expect(page.getByRole("link", { name: "Settings" })).toBeHidden();
});
