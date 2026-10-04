import { defineConfig, devices } from "@playwright/test";

// The bundled Chromium (npx playwright install chromium) runs the tests everywhere. An installed browser (for example
// PLAYWRIGHT_BROWSER_CHANNEL=chrome or msedge) is opt-in only: forcing Google Chrome on Windows meant the README's
// commands failed on a machine without it.
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  // One test at a time on a developer machine: the dev server compiles each page when it is first visited, and several
  // workers asking it for different pages at once make that first compile slower than the timeout below. CI keeps
  // Playwright's default.
  workers: process.env.CI ? undefined : 1,
  expect: {
    timeout: 5_000
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100",
    trace: "on-first-retry",
    ...(browserChannel ? { channel: browserChannel } : {})
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
