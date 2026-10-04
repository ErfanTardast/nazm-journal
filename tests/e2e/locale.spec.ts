import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// The path is relative to this file, not to the folder Playwright was started from.
const faMessages = JSON.parse(readFileSync(new URL("../../src/messages/fa.json", import.meta.url), "utf8")) as {
  auth: { signIn: string };
};

test("renders English and Persian routes", async ({ page, context }) => {
  await context.clearCookies();

  await page.goto("/en/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.goto("/fa/login");
  await expect(page.getByRole("heading", { name: faMessages.auth.signIn })).toBeVisible();
  await expect(page.locator(".dir-rtl")).toBeVisible();
});
