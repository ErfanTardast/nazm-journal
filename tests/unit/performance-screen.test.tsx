import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import { calculateJournalMetrics } from "@/lib/calculations/journal";

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(), isAuthError: () => false }));
import { apiFetch } from "@/lib/api/client";
import { PerformanceScreen } from "@/features/performance/performance-screen";

afterEach(cleanup);

const baseMetrics = {
  totalTrades: 60,
  wins: 19,
  losses: 41,
  winRate: 19 / 60,
  grossProfit: 76.42,
  grossLoss: 333.42,
  netPnl: -257,
  averageR: -0.13,
  profitFactor: 0.23,
  expectancy: -4.28,
  maxDrawdownAmount: 275.51,
  maxDrawdownR: 7.9,
  equityCurve: [-2.54, -5.08]
};

function serve(setups: Record<string, number>, metrics: object = baseMetrics) {
  (apiFetch as Mock).mockImplementation(async (url: string) =>
    url === "/api/trades" ? { trades: [] } : { metrics: { ...metrics, setups } }
  );
}

describe("PerformanceScreen entries", () => {
  it("shows per-entry stats when ladder legs were combined", async () => {
    serve({ count: 20, combined: 20, pendingLegs: 0, wins: 8, losses: 12, winRate: 0.4, averageR: -0.21, expectancy: -12.85 });
    render(<PerformanceScreen locale="en" messages={getMessages("en")} />);

    expect(await screen.findByText(/ladder legs combined/i)).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("-0.21")).toBeInTheDocument();
  });

  it("hides the entries row when no trade was split into legs", async () => {
    serve({ count: 60, combined: 0, pendingLegs: 0, wins: 19, losses: 41, winRate: 19 / 60, averageR: -0.13, expectancy: -4.28 });
    render(<PerformanceScreen locale="en" messages={getMessages("en")} />);

    await screen.findByText("Average R");
    expect(screen.queryByText(/ladder legs combined/i)).not.toBeInTheDocument();
  });

  it("says when closed legs wait for the rest of their entry (from real metrics)", async () => {
    const opened = new Date(Date.UTC(2026, 7, 29, 20, 4, 44));
    const legBase = { market: "crypto" as const, side: "long" as const, entryPrice: 100, stopLoss: 99, quantity: 0.05, fees: 0, openedAt: opened };
    const metrics = calculateJournalMetrics([
      { ...legBase, status: "closed", exitPrice: 101, ladderKey: "K", ladderLeg: 1, ladderSize: 3, realizedPnl: 5 },
      { ...legBase, status: "closed", exitPrice: 101, ladderKey: "K", ladderLeg: 2, ladderSize: 3, realizedPnl: 5 },
      { ...legBase, status: "closed", exitPrice: 102, realizedPnl: 10 }
    ]);
    const { setups, ...rest } = metrics;
    serve(setups, rest);
    render(<PerformanceScreen locale="en" messages={getMessages("en")} />);

    expect(await screen.findByText(/2 closed positions belong to entries whose other legs are still open or not imported yet/i)).toBeInTheDocument();
  });

  it("shows the drawdown in money and in R", async () => {
    serve({ count: 60, combined: 0, pendingLegs: 0, wins: 19, losses: 41, winRate: 19 / 60, averageR: -0.13, expectancy: -4.28 });
    render(<PerformanceScreen locale="en" messages={getMessages("en")} />);

    expect(await screen.findByText("$275.51")).toBeInTheDocument();
    expect(screen.getByText("7.9R")).toBeInTheDocument();
  });

  it("adds the share of the starting balance when the balance is set", async () => {
    serve({ count: 60, combined: 0, pendingLegs: 0, wins: 19, losses: 41, winRate: 19 / 60, averageR: -0.13, expectancy: -4.28 }, { ...baseMetrics, maxDrawdownPct: 0.0276 });
    render(<PerformanceScreen locale="en" messages={getMessages("en")} />);

    expect(await screen.findByText("7.9R · 2.76%")).toBeInTheDocument();
  });

  it("says wins are counted after costs", async () => {
    serve({ count: 60, combined: 0, pendingLegs: 0, wins: 19, losses: 41, winRate: 19 / 60, averageR: -0.13, expectancy: -4.28 });
    render(<PerformanceScreen locale="fa" messages={getMessages("fa")} />);

    expect(await screen.findByText(/بعد از کمیسیون و سواپ/)).toBeInTheDocument();
  });

  // Zeroed stat cards ("Win rate 0%", "Expectancy $0.00") read as results for an account with no trades.
  it("shows one not-enough-data state instead of zeroed stat cards when there are no closed trades", async () => {
    serve({ count: 0, combined: 0, pendingLegs: 0, wins: 0, losses: 0, winRate: 0, averageR: 0, expectancy: 0 }, { ...baseMetrics, totalTrades: 0, wins: 0, losses: 0, winRate: 0, netPnl: 0, averageR: 0, expectancy: 0, maxDrawdownAmount: 0, maxDrawdownR: 0, equityCurve: [] });
    render(<PerformanceScreen locale="en" messages={getMessages("en")} />);

    expect(await screen.findByText("Not enough data yet")).toBeInTheDocument();
    expect(screen.queryByText("Average R")).not.toBeInTheDocument();
    expect(screen.queryByText(/after commission and swap/i)).not.toBeInTheDocument();
  });

  it("says it in Persian too", async () => {
    serve({ count: 0, combined: 0, pendingLegs: 0, wins: 0, losses: 0, winRate: 0, averageR: 0, expectancy: 0 }, { ...baseMetrics, totalTrades: 0, wins: 0, losses: 0, winRate: 0, netPnl: 0, averageR: 0, expectancy: 0, maxDrawdownAmount: 0, maxDrawdownR: 0, equityCurve: [] });
    render(<PerformanceScreen locale="fa" messages={getMessages("fa")} />);

    expect(await screen.findByText("هنوز داده کافی نیست")).toBeInTheDocument();
  });
});
