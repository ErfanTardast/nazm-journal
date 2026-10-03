import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/trades", () => ({ getTradeMetrics: vi.fn() }));
import { getTradeMetrics } from "@/lib/services/trades";
import { LocalAiProvider } from "@/lib/services/ai";

const metrics = (maxDrawdownR: number) => ({
  totalTrades: 60,
  wins: 19,
  losses: 41,
  winRate: 19 / 60,
  grossProfit: 76.42,
  grossLoss: 333.42,
  netPnl: -257,
  averageR: -0.14,
  profitFactor: 0.23,
  expectancy: -4.28,
  maxDrawdownAmount: 275.51,
  maxDrawdownR,
  equityCurve: [],
  setups: { count: 20, combined: 20, pendingLegs: 0, wins: 6, losses: 14, winRate: 0.3, averageR: -0.14, expectancy: -12.85 }
});

describe("local coach drawdown notes", () => {
  it("flags a drawdown of 10R or more, measured in R rather than an unknown balance", async () => {
    vi.mocked(getTradeMetrics).mockResolvedValue(metrics(12.4) as never);
    const provider = new LocalAiProvider();

    expect((await provider.journalInsights("u1")).risks[0]).toMatch(/12\.4R/);
    expect((await provider.weeklyReview("u1", "professional_coach")).risks[0]).toMatch(/12\.4R/);
  });

  it("calls a smaller drawdown contained", async () => {
    vi.mocked(getTradeMetrics).mockResolvedValue(metrics(2) as never);

    expect((await new LocalAiProvider().journalInsights("u1")).risks[0]).toMatch(/contained/i);
  });
});

// A brand-new account was told "Win rate: 0.0%" and "Drawdown is contained" from zero trades.
describe("local coach with no closed trades", () => {
  const empty = { ...metrics(0), totalTrades: 0, wins: 0, losses: 0, winRate: 0, netPnl: 0, averageR: 0, profitFactor: 0, expectancy: 0 };

  it("journal insights say there is not enough data instead of printing zeroed statistics", async () => {
    vi.mocked(getTradeMetrics).mockResolvedValue(empty as never);
    const insight = await new LocalAiProvider().journalInsights("u1");

    expect(insight.summary).toMatch(/not enough data yet/i);
    expect([...insight.observations, ...insight.risks].join(" ")).not.toMatch(/win rate|expectancy|profit factor|drawdown/i);
    expect(insight.nextActions[0]).toMatch(/journal/i);
  });

  it("weekly review says there is not enough data instead of printing zeroed statistics", async () => {
    vi.mocked(getTradeMetrics).mockResolvedValue(empty as never);
    const review = await new LocalAiProvider().weeklyReview("u1", "professional_coach");

    expect(review.summary).toMatch(/not enough data yet/i);
    expect([...review.observations, ...review.risks].join(" ")).not.toMatch(/net p&l|average r|drawdown/i);
  });

  it("keeps the statistics once there is a closed trade", async () => {
    vi.mocked(getTradeMetrics).mockResolvedValue({ ...empty, totalTrades: 1, wins: 1, winRate: 1 } as never);

    expect((await new LocalAiProvider().journalInsights("u1")).observations.join(" ")).toMatch(/win rate: 100.0%/i);
  });
});
