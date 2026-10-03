import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/trades", () => ({ getTradeMetrics: vi.fn() }));
import { getTradeMetrics } from "@/lib/services/trades";
import { OpenAiProvider } from "@/lib/services/ai/openai-provider";
import { __resetMemoryStore } from "@/lib/cache/store";
import { LocalAiProvider } from "@/lib/services/ai";

const payload = { summary: "Process review.", observations: ["Defined risk."], risks: ["Small sample."], nextActions: ["Log the lesson."] };
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

describe("OpenAiProvider cache keys", () => {
  beforeEach(() => {
    __resetMemoryStore();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("AI_DAILY_CALL_CAP", "50");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }) }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(["journalInsights", "weeklyReview"] as const)("asks again for %s when only the drawdown in R changed", async (method) => {
    const provider = new OpenAiProvider(new LocalAiProvider());
    const call = () => (method === "journalInsights" ? provider.journalInsights("u1") : provider.weeklyReview("u1", "professional_coach"));

    vi.mocked(getTradeMetrics).mockResolvedValue(metrics(9.1) as never);
    await call();
    vi.mocked(getTradeMetrics).mockResolvedValue(metrics(12.4) as never);
    await call();

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
