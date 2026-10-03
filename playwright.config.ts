import { defineConfig, devices } from "@playwright/test";

const localBrowserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? (!process.env.CI && process.platform === "win32" ? "chrome" : undefined);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100",
    trace: "on-first-retry",
    ...(localBrowserChannel ? { channel: localBrowserChannel } : {})
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npx next dev -p 3100",
        url: "http://localhost:3100/en",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
      },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } }
  ]
});
