import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api/client")>()), apiFetch: api.apiFetch }));

import { SettingsScreen } from "@/features/settings/settings-screen";

const fa = getMessages("fa");

const settings = {
  locale: "en",
  theme: "dark",
  timezone: "UTC",
  riskPerTradePct: 1,
  maxDailyLossPct: 3,
  maxWeeklyLossPct: 6,
  startingBalance: null,
  brokerTimeZone: "America/New_York"
};
const options = {
  product: { supportedMarkets: [], coreWorkflows: [], safetyGuardrails: [] },
  userDefaults: {
    locales: [{ value: "en", label: "English", description: "" }, { value: "fa", label: "فارسی", description: "" }],
    themes: [{ value: "dark", label: "Dark", description: "" }, { value: "light", label: "Light", description: "" }],
    timezones: ["UTC", "Asia/Tehran"],
    riskPresets: []
  },
  ai: { provider: "local", workflows: [] },
  infrastructure: { database: "postgres", redis: "memory fallback", emailProvider: "local", marketDataProvider: "local", appUrl: "http://localhost" }
};

function mockApi() {
  api.apiFetch.mockImplementation(async (path: string) => {
    if (path === "/api/users/me/settings") return { settings };
    if (path === "/api/system/options") return { options };
    if (path === "/api/privacy/inventory") return { categories: [] };
    return {};
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Language and Theme were saved ("Settings saved") but nothing read them; a Persian user saw "English" preselected.
describe("SettingsScreen preferences", () => {
  it("does not show the Language and Theme controls that change nothing", async () => {
    mockApi();
    const { container } = render(<SettingsScreen locale="fa" messages={fa} />);
    await screen.findByText(fa.pages.settings);
    expect(container.querySelector('[name="locale"]')).toBeNull();
    expect(container.querySelector('[name="theme"]')).toBeNull();
    expect(container.querySelector('[name="timezone"]')).not.toBeNull();
    expect(container.querySelector('[name="riskPerTradePct"]')).not.toBeNull();
  });

  it("saves the remaining preferences without touching language or theme", async () => {
    mockApi();
    const { container } = render(<SettingsScreen locale="fa" messages={fa} />);
    await screen.findByText(fa.pages.settings);
    fireEvent.submit(container.querySelector('[name="riskPerTradePct"]')!.closest("form")!);
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith("/api/users/me/settings", expect.objectContaining({ method: "PATCH" })));
    const patch = api.apiFetch.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")!;
    const body = JSON.parse((patch[1] as RequestInit).body as string);
    expect(body).not.toHaveProperty("locale");
    expect(body).not.toHaveProperty("theme");
    expect(body).toMatchObject({ riskPerTradePct: "1", timezone: "UTC" });
  });
});

// The file a person saves holds their whole journal, so its name says which product it came from.
describe("SettingsScreen data export", () => {
  it("saves the export as nazm-export-<day>.json", async () => {
    mockApi();
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:export"), revokeObjectURL: vi.fn() });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const downloads: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
    render(<SettingsScreen locale="fa" messages={fa} />);
    fireEvent.click(await screen.findByRole("button", { name: "خروجی داده‌های من" }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]).toMatch(/^nazm-export-\d{4}-\d{2}-\d{2}\.json$/);
    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
