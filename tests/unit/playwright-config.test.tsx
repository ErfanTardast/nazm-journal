import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

vi.mock("next/navigation", () => ({ usePathname: () => "/en/dashboard", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(async () => ({})) }));

import { AppShell } from "@/components/layout/app-shell";

const realPlatform = process.platform;
const setPlatform = (value: string) => Object.defineProperty(process, "platform", { value, configurable: true });

type Loaded = {
  workers?: number;
  use?: { channel?: string; baseURL?: string };
  webServer?: { reuseExistingServer?: boolean; url?: string };
};

/** The config reads the environment when it loads, so each case loads it afresh. */
async function loadConfig(env: Record<string, string | undefined>, platform = realPlatform) {
  vi.resetModules();
  for (const key of ["CI", "PLAYWRIGHT_BROWSER_CHANNEL", "PLAYWRIGHT_BASE_URL"]) vi.stubEnv(key, "");
  for (const [key, value] of Object.entries(env)) if (value !== undefined) vi.stubEnv(key, value);
  setPlatform(platform);
  // An empty variable counts as unset, as it does in a shell.
  for (const key of ["CI", "PLAYWRIGHT_BROWSER_CHANNEL", "PLAYWRIGHT_BASE_URL"]) if (!process.env[key]) delete process.env[key];
  return (await import("../../playwright.config")).default as unknown as Loaded;
}

beforeEach(() => vi.unstubAllEnvs());
afterEach(() => {
  setPlatform(realPlatform);
  vi.unstubAllEnvs();
  cleanup();
});

// Each test re-imports the config, which loads @playwright/test: the first, cold import can take more than the
// default 5 s while the whole suite runs in parallel (it failed once that way on 2026-10-04).
describe("playwright.config.ts: the end-to-end tests run from the README's commands", { timeout: 30_000 }, () => {
  it("uses the bundled Chromium (npx playwright install chromium) on Windows too, not an installed Google Chrome", async () => {
    const config = await loadConfig({}, "win32");
    expect(config.use?.channel).toBeUndefined();
  });

  it("uses the bundled Chromium on Linux and macOS", async () => {
    expect((await loadConfig({}, "linux")).use?.channel).toBeUndefined();
    expect((await loadConfig({}, "darwin")).use?.channel).toBeUndefined();
  });

  it("uses an installed browser only when PLAYWRIGHT_BROWSER_CHANNEL asks for one", async () => {
    expect((await loadConfig({ PLAYWRIGHT_BROWSER_CHANNEL: "chrome" }, "linux")).use?.channel).toBe("chrome");
    expect((await loadConfig({ PLAYWRIGHT_BROWSER_CHANNEL: "msedge" }, "win32")).use?.channel).toBe("msedge");
  });

  it("runs one test at a time on a developer machine, so the first page compile is not raced, and lets CI choose", async () => {
    expect((await loadConfig({})).workers).toBe(1);
    expect((await loadConfig({ CI: "true" })).workers).toBeUndefined();
  });

  it("reuses a dev server that is already running, outside CI only", async () => {
    expect((await loadConfig({})).webServer?.reuseExistingServer).toBe(true);
    expect((await loadConfig({ CI: "true" })).webServer?.reuseExistingServer).toBe(false);
  });

  it("starts no server of its own when it is pointed at one", async () => {
    const config = await loadConfig({ PLAYWRIGHT_BASE_URL: "http://localhost:3000" });
    expect(config.webServer).toBeUndefined();
    expect(config.use?.baseURL).toBe("http://localhost:3000");
  });
});

// tests/e2e/login-dashboard.spec.ts expects the phone bar's labels from the message file; this checks that the bar renders them.
describe("the phone bar the end-to-end test looks for", () => {
  it("shows the daily loop in five links, the fifth being the AI Coach (not just AI)", () => {
    const messages = getMessages("en");
    render(<AppShell locale="en" messages={messages} canAccessAdmin={false} user={{ name: "Sara Sample", email: "sara@example.com" }}><p>page</p></AppShell>);
    const bar = Array.from(document.querySelectorAll(`nav[aria-label="${messages.nav.primary}"]`)).find((nav) => nav.querySelector(".grid-cols-5"));
    const labels = Array.from(bar?.querySelectorAll("a") ?? []).map((link) => link.textContent);
    expect(labels).toEqual([messages.nav.dashboard, messages.nav.plans, messages.nav.journal, messages.nav.reviews, messages.nav.ai]);
    expect(labels).toEqual(["Home", "Plan", "Journal", "Review", "AI Coach"]);
  });
});
