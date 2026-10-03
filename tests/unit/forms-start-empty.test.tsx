import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from "@/lib/api/client";
import { AiAssistantScreen } from "@/features/ai/ai-assistant-screen";
import { AlertsScreen } from "@/features/alerts/alerts-screen";
import { BacktestScreen } from "@/features/backtesting/backtest-screen";
import { CsvImportScreen } from "@/features/import/csv-import-screen";
import { IdeasScreen } from "@/features/ideas/ideas-screen";
import { JournalScreen } from "@/features/journal/journal-screen";
import { PortfolioScreen } from "@/features/portfolio/portfolio-screen";
import { StrategyScreen } from "@/features/strategy/strategy-screen";
import { WatchlistsScreen } from "@/features/watchlists/watchlists-screen";

const en = getMessages("en");
const fa = getMessages("fa");

/*
 * A create form must not ship with a made-up record in it: one click on Save would store a BTCUSDT trade from
 * June 2026 (or import three sample trades) that then feeds the win rate, discipline score and reviews.
 */

const journalRoutes = {
  "GET /api/trades": { trades: [] },
  "GET /api/trades/metrics": {
    metrics: { totalTrades: 0, winRate: 0, netPnl: 0, profitFactor: 0, expectancy: 0, averageR: 0, maxDrawdownAmount: 0, equityCurve: [] }
  },
  "GET /api/strategies": { strategies: [] },
  "GET /api/ideas": { ideas: [] },
  "GET /api/reviews": { reviews: [] },
  "GET /api/news?locale=en": { news: [] },
  "GET /api/news?locale=fa": { news: [] }
};

type Call = { key: string; body?: Record<string, unknown> };
const calls: Call[] = [];
const posted = (key: string) => calls.filter((call) => call.key === key);

function serve(routes: Record<string, unknown>) {
  calls.length = 0;
  (apiFetch as Mock).mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (!(key in routes)) throw new Error(`Unexpected request ${key}`);
    return routes[key];
  });
}

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

/** Local calendar date as YYYY-MM-DD, the way a datetime-local input reads it. */
function localToday() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Every free-text field of the page must be empty (date-time fields listed in `allowed` may start at "now"). */
function expectEmptyTextFields(container: HTMLElement, allowed: string[] = []) {
  const fields = Array.from(container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"));
  const filled = fields
    .filter((field) => !(field instanceof HTMLInputElement && ["file", "hidden", "checkbox", "radio"].includes(field.type)))
    .filter((field) => field.value !== "" && !allowed.includes(field.name))
    .map((field) => `${field.name || field.placeholder}=${field.value}`);
  expect(filled).toEqual([]);
}

function field(container: HTMLElement | HTMLFormElement, name: string) {
  const element = container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`);
  if (!element) throw new Error(`no field named ${name}`);
  return element;
}

function type(container: HTMLElement | HTMLFormElement, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) fireEvent.change(field(container, name), { target: { value } });
}

describe("journal forms start empty", () => {
  it("the full trade form has no sample trade in it and opens at the current local time", async () => {
    serve(journalRoutes);
    const { container } = render(<JournalScreen locale="en" messages={en} />);
    await screen.findByRole("button", { name: "Create trade" });

    expectEmptyTextFields(container, ["openedAt"]);
    expect(field(container, "openedAt").value.startsWith(localToday())).toBe(true);
    expect(field(container, "closedAt").value).toBe("");
    // Nothing is claimed about rule discipline until the trader says so.
    expect((field(container, "ruleFollowed") as HTMLSelectElement).value).toBe("unknown");
    // Exit price and close time start blank, so the trade starts open: a closed trade without an exit is not
    // counted anywhere and looks lost.
    expect((field(container, "status") as HTMLSelectElement).value).toBe("open");
  });

  it("one click on Create trade with the untouched form saves nothing", async () => {
    serve({ ...journalRoutes, "POST /api/trades": { trade: { id: "t1" } } });
    render(<JournalScreen locale="en" messages={en} />);
    fireEvent.click(await screen.findByRole("button", { name: "Create trade" }));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(posted("POST /api/trades")).toHaveLength(0);
  });

  it("sends the trade times as explicit instants, not zone-less local text", async () => {
    serve({ ...journalRoutes, "POST /api/trades": { trade: { id: "t1" } } });
    render(<JournalScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Create trade" });
    // The quick entry above also has symbol and entryPrice fields, so type into this button's own form.
    type(button.closest("form") as HTMLFormElement, { symbol: "ETHUSDT", entryPrice: "3000", quantity: "1", openedAt: "2026-09-29T10:30", closedAt: "2026-09-29T12:00" });
    fireEvent.click(button);

    await waitFor(() => expect(posted("POST /api/trades")).toHaveLength(1));
    const body = posted("POST /api/trades")[0].body!;
    expect(body.openedAt).toBe(new Date("2026-09-29T10:30").toISOString());
    expect(body.closedAt).toBe(new Date("2026-09-29T12:00").toISOString());
    expect(body.fees).toBe(0);
    expect(body.outcome).toBeNull();
    expect((body.journal as Record<string, unknown>).tags).toEqual([]);
  });

  it("the quick entry does not pre-claim that the rules were followed", async () => {
    serve(journalRoutes);
    render(<JournalScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Quick save" });
    const form = button.closest("form") as HTMLFormElement;
    expectEmptyTextFields(form);
    expect((form.elements.namedItem("ruleFollowed") as HTMLSelectElement).value).toBe("unknown");
  });

  it("labels the form in Persian on the Persian page", async () => {
    serve(journalRoutes);
    const { container } = render(<JournalScreen locale="fa" messages={fa} />);
    await screen.findByRole("button", { name: "ثبت معامله" });
    expect(field(container, "riskAmount").getAttribute("placeholder")).toMatch(/[؀-ۿ]/);
    expect(field(container, "tags").getAttribute("placeholder")).toMatch(/[؀-ۿ]/);
  });
});

describe("the other create forms start empty", () => {
  it("ideas", async () => {
    serve({ "GET /api/ideas": { ideas: [] }, "POST /api/ideas": { idea: { id: "i1" } } });
    const { container } = render(<IdeasScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Capture idea" });
    expectEmptyTextFields(container);
    fireEvent.click(button);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(posted("POST /api/ideas")).toHaveLength(0);
  });

  it("ideas send the default confidence only when the trader leaves it blank", async () => {
    serve({ "GET /api/ideas": { ideas: [] }, "POST /api/ideas": { idea: { id: "i1" } } });
    const { container } = render(<IdeasScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Capture idea" });
    type(container, { title: "Range retest", thesis: "Review whether the retest held." });
    fireEvent.click(button);
    await waitFor(() => expect(posted("POST /api/ideas")).toHaveLength(1));
    const body = posted("POST /api/ideas")[0].body!;
    expect(body).not.toHaveProperty("confidence");
    expect(body.symbols).toEqual([]);
  });

  it("watchlists", async () => {
    serve({ "GET /api/watchlists": { watchlists: [] }, "POST /api/watchlists": { watchlist: { id: "w1" } } });
    const { container } = render(<WatchlistsScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Save watchlist" });
    expectEmptyTextFields(container);
    fireEvent.click(button);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(posted("POST /api/watchlists")).toHaveLength(0);
  });

  it("strategies", async () => {
    serve({
      "GET /api/strategies": { strategies: [] },
      "GET /api/playbooks/adherence": { playbooks: [] },
      "GET /api/mentor-report?hidePnl=true&locale=en": { available: false, report: null },
      "POST /api/strategies": { strategy: { id: "s1" } }
    });
    const { container } = render(<StrategyScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Create strategy" });
    expectEmptyTextFields(container);
    fireEvent.click(button);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(posted("POST /api/strategies")).toHaveLength(0);
  });

  it("alerts", async () => {
    serve({ "GET /api/alerts": { alerts: [] }, "POST /api/alerts": { alert: { id: "a1" } } });
    const { container } = render(<AlertsScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Create alert" });
    expectEmptyTextFields(container);
    fireEvent.click(button);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(posted("POST /api/alerts")).toHaveLength(0);
  });

  it("backtests", async () => {
    serve({ "GET /api/backtests": { backtests: [] }, "POST /api/backtests": { backtest: { id: "b1" } } });
    const { container } = render(<BacktestScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Save scenario" });
    expectEmptyTextFields(container);
    fireEvent.click(button);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(posted("POST /api/backtests")).toHaveLength(0);
  });

  it("portfolio: both forms, with the transaction time starting at now", async () => {
    const portfolio = { id: "p1", name: "Main account", cashBalance: 1000, baseCurrency: "USD", holdings: [] };
    serve({ "GET /api/portfolios": { portfolios: [portfolio] } });
    const { container } = render(<PortfolioScreen locale="en" messages={en} />);
    await screen.findByRole("button", { name: "Add to first portfolio" });
    expectEmptyTextFields(container, ["executedAt"]);
    expect(field(container, "executedAt").value.startsWith(localToday())).toBe(true);
  });

  it("portfolio creation leaves currency and cash to the server defaults when blank", async () => {
    serve({ "GET /api/portfolios": { portfolios: [] }, "POST /api/portfolios": { portfolio: { id: "p1" } } });
    const { container } = render(<PortfolioScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Create" });
    type(container, { name: "Main account" });
    fireEvent.click(button);
    await waitFor(() => expect(posted("POST /api/portfolios")).toHaveLength(1));
    expect(posted("POST /api/portfolios")[0].body).toEqual({ name: "Main account" });
  });

  it("the AI trade review", async () => {
    serve({});
    const { container } = render(<AiAssistantScreen locale="en" messages={en} />);
    expectEmptyTextFields(container);
    fireEvent.click(screen.getByRole("button", { name: "Review journal trade" }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls).toHaveLength(0);
  });
});

describe("the CSV importer starts empty", () => {
  const sample = /BTCUSDT,crypto,long/;

  it("has no sample trades in the box and nothing to import", () => {
    render(<CsvImportScreen locale="en" messages={en} />);
    const box = screen.getByRole("textbox", { name: /content/i }) as HTMLTextAreaElement;
    expect(box.value).toBe("");
    expect(screen.getByRole("button", { name: /import valid rows/i })).toBeDisabled();
  });

  it("loads the sample only when asked, under a label that says it is a sample", () => {
    render(<CsvImportScreen locale="en" messages={en} />);
    fireEvent.click(screen.getByRole("button", { name: /^load sample/i }));
    const box = screen.getByRole("textbox", { name: /content/i }) as HTMLTextAreaElement;
    expect(box.value).toMatch(sample);
  });

  it("does not offer to import the same text a second time", async () => {
    serve({ "POST /api/trades/import": { imported: 1, duplicates: 0, validRows: 1, invalidRows: 0 } });
    render(<CsvImportScreen locale="en" messages={en} />);
    const box = screen.getByRole("textbox", { name: /content/i });
    const csv = "symbol,market,side,entryPrice,quantity,openedAt\nETHUSDT,crypto,long,3000,1,2026-09-01T10:00:00Z";
    fireEvent.change(box, { target: { value: csv } });
    const importButton = screen.getByRole("button", { name: /import valid rows/i });
    expect(importButton).not.toBeDisabled();

    fireEvent.click(importButton);
    await screen.findByText(/1 trade imported/);
    expect(screen.getByRole("button", { name: /import valid rows/i })).toBeDisabled();

    fireEvent.change(box, { target: { value: `${csv}\nBTCUSDT,crypto,long,60000,0.1,2026-09-02T10:00:00Z` } });
    expect(screen.getByRole("button", { name: /import valid rows/i })).not.toBeDisabled();
  });

  it("names the sample button in Persian on the Persian page", () => {
    render(<CsvImportScreen locale="fa" messages={fa} />);
    expect(screen.getByRole("button", { name: /بارگذاری داده نمونه/ })).toBeInTheDocument();
  });
});
