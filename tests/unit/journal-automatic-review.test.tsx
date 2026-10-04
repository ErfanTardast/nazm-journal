import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from "@/lib/api/client";
import { JournalScreen } from "@/features/journal/journal-screen";

const fa = getMessages("fa");

// A row stored before the tag lost its vendor name: the lesson still starts with the old tag.
const trade = {
  id: "t1",
  strategyId: null,
  symbol: "EURUSD",
  market: "forex",
  side: "long",
  status: "closed",
  entryPrice: 1.1,
  exitPrice: 1.106,
  stopLoss: 1.098,
  takeProfit: 1.106,
  quantity: 0.5,
  riskAmount: 100,
  riskPercent: 1,
  rMultiple: 3,
  realizedPnl: 300,
  fees: 0,
  session: null,
  setupType: null,
  confidenceScore: null,
  preTradeNotes: null,
  postTradeNotes: null,
  lessonsLearned: "[خودکار · Claude] ریسک ۱٪ رعایت شد.",
  outcome: null,
  ruleFollowed: "followed",
  openedAt: "2026-09-29T10:00:00Z",
  closedAt: "2026-09-29T12:00:00Z",
  strategy: null,
  journalEntry: { lessonsLearned: "[خودکار · Claude] ریسک ۱٪ رعایت شد.", mistakes: [], tags: [] }
};

function serve() {
  const routes: Record<string, unknown> = {
    "GET /api/trades": { trades: [trade] },
    "GET /api/trades/metrics": {
      metrics: { totalTrades: 1, winRate: 1, netPnl: 300, profitFactor: 2, expectancy: 300, averageR: 3, maxDrawdownAmount: 0, equityCurve: [0, 300] }
    },
    "GET /api/strategies": { strategies: [] },
    "GET /api/ideas": { ideas: [] },
    "GET /api/reviews": { reviews: [] },
    "GET /api/news?locale=fa": { news: [] }
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

describe("the trade dossier shows an automatic review with the neutral tag", () => {
  it("writes [خودکار] and no vendor name for a row stored with the old tag", async () => {
    serve();
    const { container } = render(<JournalScreen locale="fa" messages={fa} />);
    await screen.findByRole("button", { name: "ثبت معامله" });

    expect(container.textContent).toContain("[خودکار] ریسک ۱٪ رعایت شد.");
    expect(container.textContent).not.toContain("Claude");
  });

  it("finds that row by the tag it shows, and not by the vendor name it no longer shows", async () => {
    serve();
    render(<JournalScreen locale="fa" messages={fa} />);
    await screen.findByRole("button", { name: "ثبت معامله" });
    const search = screen.getByRole("textbox", { name: "جستجوی نماد، ستاپ، یادداشت یا خطا" });
    // The row's symbol is in the list (twice: phone list and table) while the search matches it.
    const listed = () => screen.queryAllByText("EURUSD").length > 0;
    const emptyList = () => screen.queryAllByText(fa.common.emptyTitle).length > 0;

    fireEvent.change(search, { target: { value: "[خودکار]" } });
    expect(listed()).toBe(true);
    expect(emptyList()).toBe(false);

    fireEvent.change(search, { target: { value: "Claude" } });
    expect(emptyList()).toBe(true);
  });
});
