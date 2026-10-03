import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

vi.mock("next/navigation", () => ({ usePathname: () => "/en/performance", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
vi.mock("@/features/sample/sample-workspace-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/sample/sample-workspace-client")>()),
  reloadPage: vi.fn()
}));
import { apiFetch } from "@/lib/api/client";
import { JournalScreen } from "@/features/journal/journal-screen";
import { PerformanceScreen } from "@/features/performance/performance-screen";
import { reloadPage } from "@/features/sample/sample-workspace-client";

const en = getMessages("en");
const fa = getMessages("fa");

const noMetrics = { totalTrades: 0, winRate: 0, netPnl: 0, profitFactor: 0, expectancy: 0, averageR: 0, maxDrawdownAmount: 0, maxDrawdownR: 0, equityCurve: [] };
const aTrade = {
  id: "t1",
  strategyId: null,
  symbol: "EURUSD",
  market: "forex",
  side: "long",
  status: "closed",
  entryPrice: 1.1,
  exitPrice: 1.104,
  stopLoss: 1.098,
  takeProfit: null,
  quantity: 0.5,
  riskAmount: 100,
  riskPercent: null,
  rMultiple: 2,
  realizedPnl: 200,
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
  closedAt: "2026-09-29T12:00:00Z",
  strategy: null,
  journalEntry: null
};

/** An account with no trades of its own, or one with a trade; `sample` is what GET /api/sample-workspace says. */
function serve(locale: "en" | "fa", opts: { trades: unknown[]; sample: unknown }) {
  const routes: Record<string, unknown> = {
    "GET /api/trades": { trades: opts.trades },
    "GET /api/trades/metrics": { metrics: opts.trades.length ? { ...noMetrics, totalTrades: opts.trades.length, wins: 1, losses: 0, equityCurve: [1, 2] } : noMetrics },
    "GET /api/strategies": { strategies: [] },
    "GET /api/ideas": { ideas: [] },
    "GET /api/reviews": { reviews: [] },
    [`GET /api/news?locale=${locale}`]: { news: [] },
    "GET /api/sample-workspace": opts.sample,
    "POST /api/sample-workspace": { active: true, loadedAt: "2026-10-02T09:30:00.000Z", counts: { trades: 30, strategies: 2, plans: 2, reviews: 2 } }
  };
  (apiFetch as Mock).mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    if (!(key in routes)) throw new Error(`Unexpected request ${key}`);
    return routes[key];
  });
}

const canLoad = { active: false, loadedAt: null, canLoad: true };

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

describe("the empty performance page", () => {
  it("offers sample data next to the next-step links", async () => {
    serve("en", { trades: [], sample: canLoad });
    render(<PerformanceScreen locale="en" messages={en} />);

    expect(await screen.findByText("Not enough data yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Import MT5 trades" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log a trade in the journal" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Load sample data" })).toBeInTheDocument();
  });

  it("loads the sample data and has the page reload when nothing else refetches it", async () => {
    serve("en", { trades: [], sample: canLoad });
    render(<PerformanceScreen locale="en" messages={en} />);
    fireEvent.click(await screen.findByRole("button", { name: "Load sample data" }));

    await waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1));
    expect(apiFetch).toHaveBeenCalledWith("/api/sample-workspace", { method: "POST", body: JSON.stringify({ locale: "en" }) });
  });

  it("offers it in Persian on the Persian page", async () => {
    serve("fa", { trades: [], sample: canLoad });
    render(<PerformanceScreen locale="fa" messages={fa} />);

    expect(await screen.findByRole("button", { name: "بارگذاری داده نمونه" })).toBeInTheDocument();
  });

  it("does not offer it when the account has trades of its own, or sample data is loaded", async () => {
    serve("en", { trades: [], sample: { active: false, loadedAt: null, canLoad: false } });
    const { unmount } = render(<PerformanceScreen locale="en" messages={en} />);
    await screen.findByText("Not enough data yet");
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/sample-workspace"));
    expect(screen.queryByRole("button", { name: "Load sample data" })).toBeNull();
    unmount();

    serve("en", { trades: [], sample: { active: true, loadedAt: "2026-10-02T09:30:00.000Z", canLoad: true } });
    render(<PerformanceScreen locale="en" messages={en} />);
    await screen.findByText("Not enough data yet");
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/sample-workspace"));
    expect(screen.queryByRole("button", { name: "Load sample data" })).toBeNull();
  });

  it("still shows the empty state when the offer cannot ask", async () => {
    serve("en", { trades: [], sample: null });
    (apiFetch as Mock).mockImplementation(async (path: string) => {
      if (path === "/api/sample-workspace") throw new Error("down");
      return path === "/api/trades" ? { trades: [] } : { metrics: noMetrics };
    });
    render(<PerformanceScreen locale="en" messages={en} />);

    expect(await screen.findByText("Not enough data yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Import MT5 trades" })).toBeInTheDocument();
  });

  it("is not on the page once there are trades", async () => {
    serve("en", { trades: [aTrade], sample: canLoad });
    render(<PerformanceScreen locale="en" messages={en} />);

    await screen.findByText("Win rate");
    expect(screen.queryByRole("button", { name: "Load sample data" })).toBeNull();
  });
});

describe("the empty journal", () => {
  it("offers sample data under the empty state, beside the import link", async () => {
    serve("en", { trades: [], sample: canLoad });
    render(<JournalScreen locale="en" messages={en} />);

    await screen.findByRole("button", { name: "Create trade" });
    expect(screen.getByText("No trades yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Import MT5 trades" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Load sample data" })).toBeInTheDocument();
  });

  it("offers it in Persian on the Persian page", async () => {
    serve("fa", { trades: [], sample: canLoad });
    render(<JournalScreen locale="fa" messages={fa} />);

    expect(await screen.findByRole("button", { name: "بارگذاری داده نمونه" })).toBeInTheDocument();
  });

  it("does not offer it when the account may not load it", async () => {
    serve("en", { trades: [], sample: { active: false, loadedAt: null, canLoad: false } });
    render(<JournalScreen locale="en" messages={en} />);

    await screen.findByRole("button", { name: "Create trade" });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/sample-workspace"));
    expect(screen.queryByRole("button", { name: "Load sample data" })).toBeNull();
  });

  it("is not on the page once there are trades", async () => {
    serve("en", { trades: [aTrade], sample: canLoad });
    render(<JournalScreen locale="en" messages={en} />);

    await screen.findByRole("button", { name: "Create trade" });
    expect(screen.queryByRole("button", { name: "Load sample data" })).toBeNull();
    expect(apiFetch).not.toHaveBeenCalledWith("/api/sample-workspace");
  });
});
