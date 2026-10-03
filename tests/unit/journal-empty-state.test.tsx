import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import { englishLeaks } from "./support/english-leaks";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from "@/lib/api/client";
import { JournalScreen } from "@/features/journal/journal-screen";

const en = getMessages("en");
const fa = getMessages("fa");

const trade = {
  id: "t1",
  strategyId: null,
  symbol: "BTCUSDT",
  market: "crypto",
  side: "long",
  status: "open",
  entryPrice: 65000,
  exitPrice: null,
  stopLoss: null,
  takeProfit: null,
  quantity: 0.1,
  riskAmount: null,
  riskPercent: null,
  rMultiple: null,
  realizedPnl: null,
  fees: 0,
  session: null,
  setupType: null,
  confidenceScore: null,
  preTradeNotes: null,
  postTradeNotes: null,
  lessonsLearned: null,
  outcome: null,
  ruleFollowed: "unknown",
  openedAt: "2026-09-29T10:00:00Z",
  closedAt: null,
  strategy: null,
  journalEntry: null
};

function serve(locale: "en" | "fa", trades: unknown[]) {
  const routes: Record<string, unknown> = {
    "GET /api/trades": { trades },
    "GET /api/trades/metrics": {
      metrics: { totalTrades: trades.length, winRate: 0, netPnl: 0, profitFactor: 0, expectancy: 0, averageR: 0, maxDrawdownAmount: 0, equityCurve: [] }
    },
    "GET /api/strategies": { strategies: [] },
    "GET /api/ideas": { ideas: [] },
    "GET /api/reviews": { reviews: [] },
    [`GET /api/news?locale=${locale}`]: { news: [] }
  };
  (apiFetch as Mock).mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    if (!(key in routes)) throw new Error(`Unexpected request ${key}`);
    return routes[key];
  });
}

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

// Product audit, 2026-10-01 (item 11): an empty page says what it will show and what to do next.
describe("a journal with no trades says what to do next", () => {
  it("Persian: the sentence, the main action to the MT5 import, and a pointer to the manual form", async () => {
    serve("fa", []);
    const { container } = render(<JournalScreen locale="fa" messages={fa} />);
    await screen.findByRole("button", { name: "ثبت معامله" });

    expect(container.textContent).toContain("بعد از ورود معاملات، ژورنال، آمار و منحنی سرمایه اینجا دیده می‌شوند.");
    const link = screen.getByRole("link", { name: "ورود معاملات MT5" });
    expect(link).toHaveAttribute("href", "/fa/import");
    expect(link.className).toContain("bg-primary");
    // The second sentence points at the manual form further down the page.
    expect(container.textContent).toContain("با فرم زیر");
    expect(englishLeaks(container, ["PNG", "JPG", "WebP", "GIF"])).toEqual([]);
  });

  it("English: the same, in English", async () => {
    serve("en", []);
    const { container } = render(<JournalScreen locale="en" messages={en} />);
    await screen.findByRole("button", { name: "Create trade" });

    expect(container.textContent).toContain("Once your trades are in, the journal, stats and equity curve show up here.");
    const link = screen.getByRole("link", { name: "Import MT5 trades" });
    expect(link).toHaveAttribute("href", "/en/import");
    expect(container.textContent).toContain("form below");
    expect(container.textContent).not.toMatch(/[؀-ۿ]/);
  });

  it("does not show zeroed stat cards for an account with no trades", async () => {
    serve("en", []);
    render(<JournalScreen locale="en" messages={en} />);
    await screen.findByRole("button", { name: "Create trade" });
    expect(screen.queryByText("Win rate")).toBeNull();
    expect(screen.queryByText("Net P&L")).toBeNull();
  });

  it("is gone once there are trades", async () => {
    serve("en", [trade]);
    render(<JournalScreen locale="en" messages={en} />);
    await screen.findByRole("button", { name: "Create trade" });
    expect(screen.queryByRole("link", { name: "Import MT5 trades" })).toBeNull();
    expect(screen.getByText("Win rate")).toBeInTheDocument();
  });
});

// The empty state already says "no trades"; the panels under it must not say it again, or show zeros as results.
describe("a journal with no trades shows no empty panels under the empty state", () => {
  it("English: no filters, no empty trade log, no zeroed discipline or distribution", async () => {
    serve("en", []);
    const { container } = render(<JournalScreen locale="en" messages={en} />);
    await screen.findByRole("button", { name: "Create trade" });

    expect(container.textContent).not.toContain(en.common.emptyTitle);
    expect(container.textContent).not.toContain(en.common.emptyDescription);
    expect(screen.queryByText("Journal cockpit")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Search symbol, setup, note, mistake" })).toBeNull();
    expect(screen.queryByText("Trade log")).toBeNull();
    expect(screen.queryByText("Rule discipline")).toBeNull();
    expect(screen.queryByText(/followed\.$/)).toBeNull();
    expect(screen.queryByText("R multiple distribution")).toBeNull();
    // What a trader can do on an empty journal stays.
    expect(screen.getByText("Quick entry")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create trade" })).toBeInTheDocument();
    expect(screen.getByText("No trades yet")).toBeInTheDocument();
  });

  it("Persian: the same", async () => {
    serve("fa", []);
    const { container } = render(<JournalScreen locale="fa" messages={fa} />);
    await screen.findByRole("button", { name: "ثبت معامله" });

    expect(container.textContent).not.toContain(fa.common.emptyTitle);
    expect(container.textContent).not.toContain(fa.common.emptyDescription);
    expect(screen.queryByText("میز کار ژورنال")).toBeNull();
    expect(screen.queryByText("گزارش معاملات")).toBeNull();
    expect(screen.queryByText("انضباط قوانین")).toBeNull();
    expect(screen.queryByText(/رعایت شد\.$/)).toBeNull();
    expect(screen.queryByText("توزیع R")).toBeNull();
    expect(screen.getByText("هنوز معامله‌ای ثبت نشده است")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ذخیره سریع" })).toBeInTheDocument();
  });

  it("comes back, in both languages, once there are trades", async () => {
    serve("en", [trade]);
    const { unmount } = render(<JournalScreen locale="en" messages={en} />);
    await screen.findByRole("button", { name: "Create trade" });
    expect(screen.getByText("Journal cockpit")).toBeInTheDocument();
    expect(screen.getByText("Trade log")).toBeInTheDocument();
    expect(screen.getByText("Rule discipline")).toBeInTheDocument();
    expect(screen.getByText(/followed\.$/)).toBeInTheDocument();
    expect(screen.getByText("R multiple distribution")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    unmount();

    serve("fa", [trade]);
    render(<JournalScreen locale="fa" messages={fa} />);
    await screen.findByRole("button", { name: "ثبت معامله" });
    expect(screen.getByText("میز کار ژورنال")).toBeInTheDocument();
    expect(screen.getByText("گزارش معاملات")).toBeInTheDocument();
    expect(screen.getByText("انضباط قوانین")).toBeInTheDocument();
    expect(screen.getByText(/رعایت شد\.$/)).toBeInTheDocument();
    expect(screen.getByText("توزیع R")).toBeInTheDocument();
  });
});
