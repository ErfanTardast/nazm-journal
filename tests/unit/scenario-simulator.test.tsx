import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import { getSystemOptions } from "@/lib/services/system-options";
import { DATA_CATEGORIES } from "@/lib/privacy/data-inventory";
import { visibleStrings } from "./support/english-leaks";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { BacktestScreen } from "@/features/backtesting/backtest-screen";
import { SettingsScreen } from "@/features/settings/settings-screen";
import { generateMetadata } from "@/app/[locale]/backtests/page";

const en = getMessages("en");
const fa = getMessages("fa");

/*
 * Product audit item 8: the page records the outcome of one scenario, it is not a backtest engine. The old name must
 * not reach a trader in either language: not on the page, not in the settings data list, not in the message files.
 */
const OLD_NAME = /back[\s-]?test|بک[\s‌]?تست/i;

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

function serve(routes: Record<string, unknown | ((init?: RequestInit) => unknown)>) {
  (apiFetch as Mock).mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    if (!(key in routes)) throw new Error(`Unexpected request ${key}`);
    const handler = routes[key];
    return typeof handler === "function" ? handler(init) : handler;
  });
}

function oldNameOn(root: HTMLElement) {
  return visibleStrings(root).filter((text) => OLD_NAME.test(text));
}

const saved = [{ id: "b1", name: "Range fade, first month", market: "forex", timeframe: "1h", result: { netPnl: 120, winRate: 0.5, maxDrawdown: 0.1 } }];

/** Every string value in a message file (the key `backtests` stays: it names the URL and the API). */
function values(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (node && typeof node === "object") return Object.values(node).flatMap(values);
  return [];
}

describe("message files", () => {
  it("never use the old name in any text", () => {
    expect(values(en).filter((text) => OLD_NAME.test(text))).toEqual([]);
    expect(values(fa).filter((text) => OLD_NAME.test(text))).toEqual([]);
    expect(values(en).length).toBeGreaterThan(100);
  });

  it("call the page the scenario simulator in the navigation and as the page title", () => {
    expect(en.nav.backtests).toBe("Scenario simulator");
    expect(en.pages.backtests).toBe("Scenario simulator");
    expect(fa.nav.backtests).toBe("شبیه‌ساز سناریو");
    expect(fa.pages.backtests).toBe("شبیه‌ساز سناریو");
  });
});

describe("the scenario simulator page", () => {
  it.each([
    ["en", en],
    ["fa", fa]
  ] as const)("does not use the old name in %s: empty page, saved list, or a failed save", async (locale, messages) => {
    serve({
      "GET /api/backtests": { backtests: [] },
      "POST /api/backtests": () => {
        throw new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { fieldErrors: { startingBalance: ["Too small"] } });
      }
    });
    const { container } = render(<BacktestScreen locale={locale} messages={messages} />);
    await screen.findByText(locale === "en" ? "No scenarios saved yet" : "هنوز سناریویی ثبت نشده");
    expect(oldNameOn(container)).toEqual([]);

    for (const [name, value] of Object.entries({ name: "x1", timeframe: "1h", startingBalance: "0", entryPrice: "100", exitPrice: "110", quantity: "1" })) {
      fireEvent.change(container.querySelector(`[name="${name}"]`)!, { target: { value } });
    }
    fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Save scenario" : "ثبت سناریو" }));
    const alert = await screen.findByRole("alert");
    expect(oldNameOn(container)).toEqual([]);
    expect(alert.textContent).not.toMatch(OLD_NAME);
  });

  it.each([
    ["en", en],
    ["fa", fa]
  ] as const)("does not use the old name in %s when scenarios are listed or cannot be loaded", async (locale, messages) => {
    serve({ "GET /api/backtests": { backtests: saved } });
    const listed = render(<BacktestScreen locale={locale} messages={messages} />);
    await screen.findByRole("table");
    expect(oldNameOn(listed.container)).toEqual([]);
    listed.unmount();

    (apiFetch as Mock).mockReset();
    (apiFetch as Mock).mockRejectedValue(new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR"));
    const failed = render(<BacktestScreen locale={locale} messages={messages} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(OLD_NAME);
    expect(oldNameOn(failed.container)).toEqual([]);
  });

  it("says plainly that it records the result of one scenario and does not test against historical data (English)", async () => {
    serve({ "GET /api/backtests": { backtests: [] } });
    render(<BacktestScreen locale="en" messages={en} />);
    await screen.findByText("No scenarios saved yet");
    expect(screen.getByRole("heading", { level: 1, name: "Scenario simulator" })).toBeInTheDocument();
    const description = screen.getByText(/Record the result of one scenario/);
    expect(description.textContent).toMatch(/market, timeframe/i);
    expect(description.textContent).toMatch(/compare versions of a strategy/i);
    expect(description.textContent).toMatch(/does not test against historical/i);
    expect(screen.getByRole("heading", { name: "New scenario" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save scenario" })).toBeInTheDocument();
  });

  it("says the same in Persian", async () => {
    serve({ "GET /api/backtests": { backtests: [] } });
    render(<BacktestScreen locale="fa" messages={fa} />);
    await screen.findByText("هنوز سناریویی ثبت نشده");
    expect(screen.getByRole("heading", { level: 1, name: "شبیه‌ساز سناریو" })).toBeInTheDocument();
    const description = screen.getByText(/نتیجه یک سناریو را برای یک استراتژی ثبت کنید/);
    expect(description.textContent).toMatch(/بازار، تایم‌فریم و نتیجه/);
    expect(description.textContent).toMatch(/نسخه‌های مختلف استراتژی را با هم مقایسه کنید/);
    expect(description.textContent).toMatch(/داده‌های تاریخی/);
    // "آزمون گرفتن" means to give an exam; the page does not test a strategy against past prices.
    expect(description.textContent).toContain("این صفحه استراتژی را با داده‌های تاریخی قیمت آزمایش نمی‌کند.");
    expect(description.textContent).not.toContain("آزمون");
    expect(screen.getByRole("heading", { name: "سناریوی جدید" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ثبت سناریو" })).toBeInTheDocument();
  });

  it("points an empty list to the form above it", async () => {
    serve({ "GET /api/backtests": { backtests: [] } });
    render(<BacktestScreen locale="en" messages={en} />);
    await screen.findByText("No scenarios saved yet");
    expect(screen.getByText(/with the form above/i)).toBeInTheDocument();
  });

  it("posts to the same API path as before", async () => {
    serve({ "GET /api/backtests": { backtests: [] }, "POST /api/backtests": { backtest: { id: "b2" } } });
    const { container } = render(<BacktestScreen locale="en" messages={en} />);
    await screen.findByText("No scenarios saved yet");
    for (const [name, value] of Object.entries({ name: "Range fade", timeframe: "1h", startingBalance: "25000", entryPrice: "100", exitPrice: "110", quantity: "1" })) {
      fireEvent.change(container.querySelector(`[name="${name}"]`)!, { target: { value } });
    }
    fireEvent.click(screen.getByRole("button", { name: "Save scenario" }));
    await waitFor(() => expect((apiFetch as Mock).mock.calls.some(([path, init]) => path === "/api/backtests" && init?.method === "POST")).toBe(true));
  });
});

describe("settings", () => {
  const settings = {
    locale: "en",
    theme: "dark",
    timezone: "Asia/Tehran",
    riskPerTradePct: 1,
    maxDailyLossPct: 3,
    maxWeeklyLossPct: 6,
    startingBalance: null,
    brokerTimeZone: "mt5:new-york-close"
  };
  const options = JSON.parse(JSON.stringify(getSystemOptions()));
  const categories = DATA_CATEGORIES.filter(({ key }) => key !== "payments").map(({ key, label, description, exportable }) => ({ key, label, description, exportable }));

  it.each([
    ["en", en],
    ["fa", fa]
  ] as const)("lists the saved scenarios under their new name in %s", async (locale, messages) => {
    serve({
      "GET /api/users/me/settings": { settings },
      "GET /api/system/options": { options },
      "GET /api/privacy/inventory": { categories }
    });
    const { container } = render(<SettingsScreen locale={locale} messages={messages} />);
    await screen.findByText(messages.pages.settings);
    // The data list is loaded after the page: wait for one of its rows.
    await screen.findByText(locale === "en" ? /^Watchlists —/ : /^فهرست نمادها —/);
    expect(oldNameOn(container)).toEqual([]);
    const row = screen.getByText(locale === "en" ? /^Scenarios —/ : /^سناریوها —/);
    expect(within(row.closest("li")!).getByText(locale === "en" ? "in export" : "در خروجی")).toBeInTheDocument();
  });
});

describe("page metadata", () => {
  it("titles the page with the new name in each language", async () => {
    const enTitle = String((await generateMetadata({ params: Promise.resolve({ locale: "en" }) })).title);
    const faTitle = String((await generateMetadata({ params: Promise.resolve({ locale: "fa" }) })).title);
    expect(enTitle).toContain("Scenario simulator");
    expect(faTitle).toContain("شبیه‌ساز سناریو");
    expect(enTitle).not.toMatch(OLD_NAME);
    expect(faTitle).not.toMatch(OLD_NAME);
  });

  it("gives no title for an unknown language", async () => {
    expect(await generateMetadata({ params: Promise.resolve({ locale: "de" }) })).toEqual({});
  });
});
