import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from "@/lib/api/client";
import { JournalScreen } from "@/features/journal/journal-screen";
import { NewsScreen } from "@/features/news/news-screen";

const en = getMessages("en");
const fa = getMessages("fa");

const trade = {
  id: "t1",
  strategyId: null,
  symbol: "BTCUSDT",
  market: "crypto",
  side: "long",
  status: "closed",
  entryPrice: 65000,
  exitPrice: 66000,
  stopLoss: 64000,
  takeProfit: 67000,
  quantity: 0.1,
  riskAmount: 100,
  riskPercent: 1,
  rMultiple: 1,
  realizedPnl: 100,
  fees: 1,
  session: null,
  setupType: null,
  confidenceScore: 7,
  preTradeNotes: null,
  postTradeNotes: null,
  lessonsLearned: null,
  outcome: null,
  ruleFollowed: "followed",
  openedAt: "2026-09-29T10:00:00Z",
  closedAt: "2026-09-29T12:00:00Z",
  strategy: null,
  journalEntry: null
};

const newsItem = {
  id: "n1",
  title: "A very long headline that would not fit in a narrow card without making the table wider than the screen",
  source: "Local source",
  language: "en",
  market: "forex",
  category: "central_bank",
  importance: "high",
  sentiment: "caution",
  summary: "Check the time of the event and the size of the risk.",
  riskNotes: ["Check the economic calendar"]
};

function serve(routes: Record<string, unknown>) {
  (apiFetch as Mock).mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    if (!(key in routes)) throw new Error(`Unexpected request ${key}`);
    return routes[key];
  });
}

function journalRoutes(locale: "en" | "fa") {
  return {
    "GET /api/trades": { trades: [trade] },
    "GET /api/trades/metrics": {
      metrics: { totalTrades: 1, winRate: 1, netPnl: 100, profitFactor: 2, expectancy: 100, averageR: 1, maxDrawdownAmount: 20, equityCurve: [0, 50, 100] }
    },
    "GET /api/strategies": { strategies: [] },
    "GET /api/ideas": { ideas: [] },
    "GET /api/reviews": { reviews: [] },
    [`GET /api/news?locale=${locale}`]: { news: [] }
  };
}

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

/**
 * Below the xl breakpoint a grid with no column template has one implicit `auto` column, and `auto` lets a child grow
 * to its content's minimum width: a wide table or a long line then pushes the whole page sideways on a phone.
 * `grid-cols-1` is `minmax(0, 1fr)`, and `min-w-0` lets a grid child shrink below its content.
 */
function pageGrid(container: HTMLElement, xlColumns: string) {
  const grid = container.querySelector(`[class~="xl:grid-cols-[${xlColumns}]"]`);
  expect(grid, "the two-column page grid").not.toBeNull();
  return grid as HTMLElement;
}

describe("no sideways scroll on a phone: the journal page", () => {
  for (const [locale, messages, createName] of [
    ["en", en, "Create trade"],
    ["fa", fa, "ثبت معامله"]
  ] as const) {
    it(`${locale}: the page grid is one shrinkable column below xl and both columns can shrink`, async () => {
      serve(journalRoutes(locale));
      const { container } = render(<JournalScreen locale={locale} messages={messages} />);
      await screen.findByRole("button", { name: createName });

      const grid = pageGrid(container, "minmax(0,1.25fr)_minmax(360px,0.75fr)");
      expect(grid).toHaveClass("grid-cols-1");
      expect(grid.children).toHaveLength(2);
      for (const column of Array.from(grid.children)) expect(column).toHaveClass("min-w-0");
    });
  }
});

describe("no sideways scroll on a phone: the news page", () => {
  for (const [locale, messages] of [
    ["en", en],
    ["fa", fa]
  ] as const) {
    it(`${locale}: the page grid is one shrinkable column below xl and both columns can shrink`, async () => {
      serve({ [`GET /api/news?locale=${locale}`]: { news: [newsItem] } });
      const { container } = render(<NewsScreen locale={locale} messages={messages} />);
      await screen.findByRole("table");

      const grid = pageGrid(container, "minmax(0,1.1fr)_420px");
      expect(grid).toHaveClass("grid-cols-1");
      expect(grid.children).toHaveLength(2);
      for (const column of Array.from(grid.children)) expect(column).toHaveClass("min-w-0");
    });

    it(`${locale}: the table scrolls inside its card, not the page`, async () => {
      serve({ [`GET /api/news?locale=${locale}`]: { news: [newsItem] } });
      render(<NewsScreen locale={locale} messages={messages} />);
      const table = await screen.findByRole("table");
      expect(table.closest(".overflow-x-auto")).not.toBeNull();
    });
  }
});
