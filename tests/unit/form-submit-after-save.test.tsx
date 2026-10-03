import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from "@/lib/api/client";
import { AlertsScreen } from "@/features/alerts/alerts-screen";
import { BacktestScreen } from "@/features/backtesting/backtest-screen";
import { IdeasScreen } from "@/features/ideas/ideas-screen";
import { JournalScreen } from "@/features/journal/journal-screen";
import { PortfolioScreen } from "@/features/portfolio/portfolio-screen";
import { StrategyScreen } from "@/features/strategy/strategy-screen";
import { TradePlansScreen } from "@/features/trade-plans/trade-plans-screen";
import { WatchlistsScreen } from "@/features/watchlists/watchlists-screen";

const en = getMessages("en");

/*
 * React clears event.currentTarget as soon as a listener returns its promise, so a submit handler that reads it
 * after an await throws "Cannot read properties of null (reading 'reset')" once the save has already succeeded:
 * the list never reloads, the form keeps its values and a second click saves a duplicate. Every create form
 * must take the form element before its first await.
 */

type Call = { key: string; body?: unknown };
const calls: Call[] = [];
const count = (key: string) => calls.filter((call) => call.key === key).length;

function serve(routes: Record<string, unknown | ((init?: RequestInit) => unknown)>) {
  calls.length = 0;
  vi.mocked(apiFetch).mockImplementation((async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (!(key in routes)) throw new Error(`Unexpected request ${key}`);
    const handler = routes[key];
    return typeof handler === "function" ? await handler(init) : handler;
  }) as never);
}

function fill(form: HTMLFormElement, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) {
    const field = form.elements.namedItem(name);
    if (field instanceof HTMLElement && "value" in field) fireEvent.change(field, { target: { value } });
  }
}

function formOf(button: HTMLElement) {
  const form = button.closest("form");
  if (!form) throw new Error("button is not inside a form");
  return form;
}

let resetSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetSpy = vi.spyOn(HTMLFormElement.prototype, "reset");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(apiFetch).mockReset();
});

function expectCleanSave(container: HTMLElement) {
  expect(resetSpy).toHaveBeenCalled();
  expect(container.textContent).not.toMatch(/Cannot read properties|TypeError/);
  // Error banners are the red-tinted boxes (or the ErrorState card); stat tiles may legitimately use the text colour.
  expect(container.querySelector('[class*="bg-destructive/10"], [class*="border-destructive/40"]')).toBeNull();
}

describe("create forms after a successful save", () => {
  it("alerts reloads the list and resets the form", async () => {
    serve({ "GET /api/alerts": { alerts: [] }, "POST /api/alerts": { alert: { id: "a1" } } });
    const { container } = render(<AlertsScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Create alert" });
    fill(formOf(button), { symbol: "ETHUSDT", price: "3000", message: "Review level reached." });
    fireEvent.click(button);

    await waitFor(() => expect(count("GET /api/alerts")).toBe(2));
    expect(count("POST /api/alerts")).toBe(1);
    expectCleanSave(container);
  });

  it("strategies reloads the list and resets the form", async () => {
    serve({
      "GET /api/strategies": { strategies: [] },
      "GET /api/playbooks/adherence": { playbooks: [] },
      "GET /api/mentor-report?hidePnl=true&locale=en": { available: false, report: null },
      "POST /api/strategies": { strategy: { id: "s1" } }
    });
    const { container } = render(<StrategyScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Create strategy" });
    fill(formOf(button), {
      name: "Range fade",
      entryRules: "Wait for the sweep",
      exitRules: "Exit at range midpoint",
      invalidationRules: "Close outside the range"
    });
    fireEvent.click(formOf(button).querySelector('input[name="allowedMarkets"][value="crypto"]')!);
    fireEvent.click(button);

    await waitFor(() => expect(count("GET /api/strategies")).toBe(2));
    expect(count("POST /api/strategies")).toBe(1);
    expectCleanSave(container);
  });

  it("backtests reloads the list and resets the form", async () => {
    serve({ "GET /api/backtests": { backtests: [] }, "POST /api/backtests": { backtest: { id: "b1" } } });
    const { container } = render(<BacktestScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Save scenario" });
    fill(formOf(button), { name: "Manual run", timeframe: "1h", startingBalance: "25000", entryPrice: "100", exitPrice: "110", quantity: "10", fees: "2" });
    fireEvent.click(button);

    await waitFor(() => expect(count("GET /api/backtests")).toBe(2));
    expect(count("POST /api/backtests")).toBe(1);
    expectCleanSave(container);
  });

  it("portfolio reloads after creating a portfolio", async () => {
    serve({ "GET /api/portfolios": { portfolios: [] }, "POST /api/portfolios": { portfolio: { id: "p1" } } });
    const { container } = render(<PortfolioScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Create" });
    fill(formOf(button), { name: "Main account", baseCurrency: "USD", cashBalance: "10000" });
    fireEvent.click(button);

    await waitFor(() => expect(count("GET /api/portfolios")).toBe(2));
    expect(count("POST /api/portfolios")).toBe(1);
    expectCleanSave(container);
  });

  it("portfolio reloads after adding a transaction", async () => {
    const portfolio = { id: "p1", name: "Main account", cashBalance: 1000, baseCurrency: "USD", holdings: [] };
    serve({ "GET /api/portfolios": { portfolios: [portfolio] }, "POST /api/portfolios/p1/transactions": { transaction: { id: "t1" } } });
    const { container } = render(<PortfolioScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Add to first portfolio" });
    fill(formOf(button), { symbol: "ETHUSDT", quantity: "1", price: "3000", fees: "1", executedAt: "2026-09-29T10:00" });
    fireEvent.click(button);

    await waitFor(() => expect(count("GET /api/portfolios")).toBe(2));
    expect(count("POST /api/portfolios/p1/transactions")).toBe(1);
    expectCleanSave(container);
  });

  it("ideas reloads the list and resets the form", async () => {
    serve({ "GET /api/ideas": { ideas: [] }, "POST /api/ideas": { idea: { id: "i1" } } });
    const { container } = render(<IdeasScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Capture idea" });
    fill(formOf(button), { title: "Range retest", symbols: "ETHUSDT", thesis: "Review whether the retest held before planning." });
    fireEvent.click(button);

    await waitFor(() => expect(count("GET /api/ideas")).toBe(2));
    expect(count("POST /api/ideas")).toBe(1);
    expectCleanSave(container);
  });

  it("watchlists reloads the list and resets the form", async () => {
    serve({ "GET /api/watchlists": { watchlists: [] }, "POST /api/watchlists": { watchlist: { id: "w1" } } });
    const { container } = render(<WatchlistsScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Save watchlist" });
    fill(formOf(button), { name: "Macro context", symbol: "EURUSD", notes: "Review the calendar first." });
    fireEvent.click(button);

    await waitFor(() => expect(count("GET /api/watchlists")).toBe(2));
    expect(count("POST /api/watchlists")).toBe(1);
    expectCleanSave(container);
  });

  it("plans reloads the list and resets the form", async () => {
    serve({ "GET /api/trade-plans": { tradePlans: [] }, "POST /api/trade-plans": { tradePlan: { id: "tp1" } } });
    const { container } = render(<TradePlansScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Save plan" });
    fill(formOf(button), { symbol: "ETHUSDT", direction: "long", bias: "Constructive above the prior high", entryZone: "3000-3050" });
    fireEvent.click(button);

    await waitFor(() => expect(count("GET /api/trade-plans")).toBe(2));
    expect(count("POST /api/trade-plans")).toBe(1);
    expectCleanSave(container);
  });
});

describe("journal forms after a successful save", () => {
  const journalRoutes = (extra: Record<string, unknown>) => ({
    "GET /api/trades": { trades: [] },
    "GET /api/trades/metrics": {
      metrics: { totalTrades: 0, winRate: 0, netPnl: 0, profitFactor: 0, expectancy: 0, averageR: 0, maxDrawdownAmount: 0, equityCurve: [] }
    },
    "GET /api/strategies": { strategies: [] },
    "GET /api/ideas": { ideas: [] },
    "GET /api/reviews": { reviews: [] },
    "GET /api/news?locale=en": { news: [] },
    ...extra
  });

  it("the full trade form reloads the journal, resets and shows no error", async () => {
    serve(journalRoutes({ "POST /api/trades": { trade: { id: "t1" } } }));
    const { container } = render(<JournalScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Create trade" });
    fill(formOf(button), { symbol: "ETHUSDT", entryPrice: "3000", quantity: "1", openedAt: "2026-09-29T10:00" });
    fireEvent.click(button);

    await waitFor(() => expect(count("GET /api/trades")).toBe(2));
    expect(count("POST /api/trades")).toBe(1);
    expectCleanSave(container);
  });

  it("the quick entry reloads the journal, resets and shows no error", async () => {
    serve(journalRoutes({ "POST /api/trades": { trade: { id: "t1" } } }));
    const { container } = render(<JournalScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Quick save" });
    fill(formOf(button), { symbol: "ETHUSDT", entryPrice: "3000" });
    fireEvent.click(button);

    await waitFor(() => expect(count("GET /api/trades")).toBe(2));
    expect(count("POST /api/trades")).toBe(1);
    expectCleanSave(container);
  });
});

describe("create forms that fail to save", () => {
  it("alerts shows the error instead of swallowing it", async () => {
    serve({
      "GET /api/alerts": { alerts: [] },
      "POST /api/alerts": () => {
        throw new Error("Alert could not be saved");
      }
    });
    render(<AlertsScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Create alert" });
    fill(formOf(button), { symbol: "ETHUSDT", price: "3000", message: "Review level reached." });
    fireEvent.click(button);

    expect(await screen.findByText("Alert could not be saved")).toBeInTheDocument();
  });

  it("strategies shows the error instead of swallowing it", async () => {
    serve({
      "GET /api/strategies": { strategies: [] },
      "GET /api/playbooks/adherence": { playbooks: [] },
      "GET /api/mentor-report?hidePnl=true&locale=en": { available: false, report: null },
      "POST /api/strategies": () => {
        throw new Error("Strategy could not be saved");
      }
    });
    render(<StrategyScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Create strategy" });
    fill(formOf(button), { name: "Range fade", entryRules: "Wait for the sweep", exitRules: "Exit at the midpoint" });
    fireEvent.click(formOf(button).querySelector('input[name="allowedMarkets"][value="crypto"]')!);
    fireEvent.click(button);

    expect(await screen.findByText("Strategy could not be saved")).toBeInTheDocument();
  });

  it("backtests shows the error instead of swallowing it", async () => {
    serve({
      "GET /api/backtests": { backtests: [] },
      "POST /api/backtests": () => {
        throw new Error("Scenario could not be saved");
      }
    });
    render(<BacktestScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Save scenario" });
    fill(formOf(button), { name: "Manual run", timeframe: "1h", startingBalance: "25000", entryPrice: "100", exitPrice: "110", quantity: "10" });
    fireEvent.click(button);

    expect(await screen.findByText("Scenario could not be saved")).toBeInTheDocument();
  });

  it("portfolio keeps the page and shows the error when a transaction fails", async () => {
    const portfolio = { id: "p1", name: "Main account", cashBalance: 1000, baseCurrency: "USD", holdings: [] };
    serve({
      "GET /api/portfolios": { portfolios: [portfolio] },
      "POST /api/portfolios/p1/transactions": () => {
        throw new Error("Transaction could not be saved");
      }
    });
    render(<PortfolioScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Add to first portfolio" });
    fill(formOf(button), { symbol: "ETHUSDT", quantity: "1", price: "3000", executedAt: "2026-09-29T10:00" });
    fireEvent.click(button);

    expect(await screen.findByText("Transaction could not be saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to first portfolio" })).toBeInTheDocument();
  });
});

// Review follow-up: the alert price is typed text; Persian digits became NaN and were saved as null (2026-09-29).
describe("alert price input", () => {
  it("reads Persian digits and separators as the number the trader typed", async () => {
    serve({ "GET /api/alerts": { alerts: [] }, "POST /api/alerts": { alert: { id: "a1" } } });
    render(<AlertsScreen locale="fa" messages={getMessages("fa")} />);
    const button = await screen.findByRole("button", { name: /ساخت هشدار|ایجاد هشدار|Create alert/ });
    fill(formOf(button), { symbol: "ETHUSDT", price: "۶۵٬۰۰۰٫۵", message: "مرور سطح" });
    fireEvent.submit(formOf(button));
    await waitFor(() => expect(count("POST /api/alerts")).toBe(1));
    const body = calls.find((call) => call.key === "POST /api/alerts")?.body as { condition: { price: number } };
    expect(body.condition.price).toBe(65000.5);
  });

  it("refuses a price that is not a number instead of saving an empty condition", async () => {
    serve({ "GET /api/alerts": { alerts: [] }, "POST /api/alerts": { alert: { id: "a1" } } });
    const { container } = render(<AlertsScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Create alert" });
    fill(formOf(button), { symbol: "ETHUSDT", price: "abc", message: "Review level reached." });
    fireEvent.submit(formOf(button));
    await waitFor(() => expect(container.textContent).toMatch(/number/i));
    expect(count("POST /api/alerts")).toBe(0);
  });
});
