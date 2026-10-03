import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/trades", () => ({ getTradeMetrics: vi.fn() }));
import { getTradeMetrics } from "@/lib/services/trades";
import { LocalAiProvider, type AiResponse } from "@/lib/services/ai";
import { buildRefusalResponse, canonicalAiDisclaimer, CANONICAL_AI_DISCLAIMER, sanitizeAiResponse } from "@/lib/ai/guard";

const metrics = (maxDrawdownR: number, totalTrades = 60) => ({
  totalTrades,
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

const tradeInput = {
  symbol: "EURUSD",
  side: "long" as const,
  entryPrice: 1.1,
  exitPrice: 1.12,
  stopLoss: 1.09,
  takeProfit: 1.13
};

const PERSIAN_LETTER = /[؀-ۿ]/;
/** Every sentence of a coach answer. */
function sentences(response: AiResponse) {
  return [response.summary, ...response.observations, ...response.risks, ...response.nextActions];
}
/** English words (three or more letters) left in a Persian answer, ignoring symbols and ids the user typed. */
function englishLeft(response: AiResponse, allowed: string[]) {
  return sentences(response)
    .join(" ")
    .split(/[^A-Za-z_]+/)
    .filter((word) => word.length >= 3 && !allowed.some((typed) => typed.includes(word)));
}

type Run = { name: string; run: (provider: LocalAiProvider, locale?: "en" | "fa") => Promise<AiResponse> };
const workflows: Run[] = [
  { name: "trade review (coach)", run: (p, l) => p.reviewTrade("u1", { ...tradeInput, mode: "professional_coach" }, l) },
  { name: "trade review (learning)", run: (p, l) => p.reviewTrade("u1", { ...tradeInput, mode: "learning" }, l) },
  { name: "journal insights", run: (p, l) => p.journalInsights("u1", l) },
  { name: "weekly review (coach)", run: (p, l) => p.weeklyReview("u1", "professional_coach", l) },
  { name: "weekly review (learning)", run: (p, l) => p.weeklyReview("u1", "learning", l) },
  { name: "strategy review", run: (p, l) => p.strategyReview("u1", "strat_abc123", "professional_coach", l) },
  { name: "general strategy review", run: (p, l) => p.strategyReview("u1", undefined, "learning", l) },
  { name: "news summary (coach)", run: (p, l) => p.newsSummary("u1", "professional_coach", l) },
  { name: "news summary (learning)", run: (p, l) => p.newsSummary("u1", "learning", l) }
];

describe.each(workflows)("local coach: $name", ({ run }) => {
  it("answers in Persian for fa: no English sentences, a Persian disclaimer, still inside the educational scope", async () => {
    vi.mocked(getTradeMetrics).mockResolvedValue(metrics(12.4) as never);
    const response = await run(new LocalAiProvider(), "fa");

    for (const sentence of sentences(response)) expect(sentence).toMatch(PERSIAN_LETTER);
    expect(englishLeft(response, ["EURUSD", "strat_abc123"])).toEqual([]);
    expect(response.disclaimer).toBe(canonicalAiDisclaimer("fa"));
    expect(response.disclaimer).toMatch(PERSIAN_LETTER);
    expect(sanitizeAiResponse(response)).toEqual({ ok: true });
  });

  it("keeps the English answer unchanged for en and when no locale is given", async () => {
    vi.mocked(getTradeMetrics).mockResolvedValue(metrics(12.4) as never);
    const provider = new LocalAiProvider();
    const english = await run(provider, "en");

    expect(english).toEqual(await run(provider));
    expect(english.disclaimer).toBe(CANONICAL_AI_DISCLAIMER);
    expect(sentences(english).join(" ")).not.toMatch(PERSIAN_LETTER);
  });
});

describe("local coach in Persian: numbers and states", () => {
  it("writes statistics with Persian digits and the Persian decimal mark", async () => {
    vi.mocked(getTradeMetrics).mockResolvedValue(metrics(12.4) as never);
    const provider = new LocalAiProvider();

    const insights = await provider.journalInsights("u1", "fa");
    expect(insights.summary).toContain("۶۰");
    expect(insights.observations[0]).toContain("۳۱٫۷٪");
    expect(insights.observations[1]).toContain("‎-۴٫۲۸");
    expect(insights.observations[2]).toContain("۰٫۲۳");
    expect(insights.risks[0]).toContain("۱۲٫۴R");

    const weekly = await provider.weeklyReview("u1", "professional_coach", "fa");
    expect(weekly.observations.join(" ")).toContain("‎-۲۵۷٫۰۰");
    expect(weekly.observations.join(" ")).toContain("‎-۰٫۱۴");
  });

  it("calls a drawdown under 10R contained, in Persian", async () => {
    vi.mocked(getTradeMetrics).mockResolvedValue(metrics(2) as never);
    const insights = await new LocalAiProvider().journalInsights("u1", "fa");

    expect(insights.risks[0]).toContain("۲٫۰R");
    expect(insights.risks[0]).toContain("محدود");
  });

  it("shows the planned reward-to-risk and the trade side in a Persian trade review", async () => {
    const review = await new LocalAiProvider().reviewTrade("u1", { ...tradeInput, mode: "professional_coach" }, "fa");

    expect(review.summary).toContain("لانگ");
    expect(review.observations[0]).toContain("۳٫۰۰R");
  });

  it("reports the missing levels of a trade in Persian", async () => {
    const review = await new LocalAiProvider().reviewTrade(
      "u1",
      { symbol: "EURUSD", side: "short", entryPrice: 1.1, mode: "professional_coach" },
      "fa"
    );

    expect(review.summary).toContain("شورت");
    expect(review.observations.join(" ")).toContain("قابل محاسبه نبود");
    expect(review.risks[0]).toContain("حد ضرر");
  });

  it("says there is not enough data yet, in Persian, instead of statistics from zero trades", async () => {
    vi.mocked(getTradeMetrics).mockResolvedValue(metrics(0, 0) as never);
    const provider = new LocalAiProvider();

    for (const answer of [await provider.journalInsights("u1", "fa"), await provider.weeklyReview("u1", "learning", "fa")]) {
      expect(answer.summary).toContain("هنوز داده کافی نیست");
      expect(answer.mode).toBeDefined();
      expect(answer.observations).toHaveLength(1);
      expect(answer.nextActions[0]).toContain("ژورنال");
    }
  });
});

describe("refusal in Persian", () => {
  it("is a Persian, scope-safe refusal; English stays as it was", () => {
    const fa = buildRefusalResponse("professional_coach", "fa");

    for (const sentence of sentences(fa)) expect(sentence).toMatch(PERSIAN_LETTER);
    expect(fa.disclaimer).toBe(canonicalAiDisclaimer("fa"));
    expect(sanitizeAiResponse(fa)).toEqual({ ok: true });
    expect(buildRefusalResponse("learning", "en")).toEqual(buildRefusalResponse("learning"));
    expect(buildRefusalResponse("learning").summary).toMatch(/does not provide/);
  });
});
