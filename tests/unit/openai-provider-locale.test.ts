import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/trades", () => ({ getTradeMetrics: vi.fn() }));
import { getTradeMetrics } from "@/lib/services/trades";
import { OpenAiProvider } from "@/lib/services/ai/openai-provider";
import { CANONICAL_AI_DISCLAIMER, canonicalAiDisclaimer } from "@/lib/ai/guard";
import { __resetMemoryStore } from "@/lib/cache/store";
import { LocalAiProvider, type AiProvider, type AiResponse } from "@/lib/services/ai";

const payload = { summary: "Process review.", observations: ["Defined risk."], risks: ["Small sample."], nextActions: ["Log the lesson."] };
const persianPayload = {
  summary: "مرور فرایند: ریسک تعریف شده بود.",
  observations: ["حد ضرر مشخص بود."],
  risks: ["نمونه کوچک است."],
  nextActions: ["درس این معامله را بنویسید."]
};

const input = { symbol: "EURUSD", side: "long" as const, entryPrice: 1.1, stopLoss: 1.09, takeProfit: 1.13, mode: "learning" as const };

const metrics = (totalTrades: number) => ({
  totalTrades,
  wins: 1,
  losses: 0,
  winRate: totalTrades ? 1 : 0,
  grossProfit: 10,
  grossLoss: 0,
  netPnl: totalTrades ? 10 : 0,
  averageR: totalTrades ? 1 : 0,
  profitFactor: totalTrades ? Number.POSITIVE_INFINITY : 0,
  expectancy: totalTrades ? 10 : 0,
  maxDrawdownAmount: 0,
  maxDrawdownR: 0,
  equityCurve: [],
  setups: { count: 0, combined: 0, pendingLegs: 0, wins: 0, losses: 0, winRate: 0, averageR: 0, expectancy: 0 }
});

const sentinel: AiResponse = { disclaimer: "local", mode: "learning", summary: "LOCAL_FALLBACK", observations: [], risks: [], nextActions: [] };
function makeFallback() {
  return {
    reviewTrade: vi.fn(async () => sentinel),
    journalInsights: vi.fn(async () => sentinel),
    weeklyReview: vi.fn(async () => sentinel),
    strategyReview: vi.fn(async () => sentinel),
    newsSummary: vi.fn(async () => sentinel)
  } satisfies AiProvider;
}

function mockCompletion(content: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }) }));
}

/** The system and user messages the last model call carried. */
function sentMessages(call = 0): { system: string; user: string } {
  const body = JSON.parse(vi.mocked(fetch).mock.calls[call][1]!.body as string);
  return { system: body.messages[0].content, user: body.messages[1].content };
}

describe("OpenAiProvider language", () => {
  beforeEach(() => {
    __resetMemoryStore();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("AI_DAILY_CALL_CAP", "50");
    vi.mocked(getTradeMetrics).mockResolvedValue(metrics(8) as never);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("asks the model for natural Persian when the locale is fa, and says nothing about language otherwise", async () => {
    mockCompletion(persianPayload);
    const provider = new OpenAiProvider(makeFallback());

    await provider.reviewTrade("u1", input, "fa");
    expect(sentMessages(0).system).toMatch(/Persian/);
    expect(sentMessages(0).system).toMatch(/do not predict price or direction/);

    mockCompletion(payload);
    await provider.reviewTrade("u1", input);
    expect(sentMessages(0).system).not.toMatch(/Persian/);
  });

  it("asks in Persian for every workflow, not only the trade review", async () => {
    mockCompletion(persianPayload);
    const provider = new OpenAiProvider(makeFallback());

    await provider.journalInsights("u1", "fa");
    await provider.weeklyReview("u1", "learning", "fa");
    await provider.strategyReview("u1", "s_1", "learning", "fa");
    await provider.newsSummary("u1", "learning", "fa");

    for (let call = 0; call < 4; call += 1) expect(sentMessages(call).system).toMatch(/Persian/);
  });

  it("keeps a Persian answer and an English answer to the same request apart in the cache", async () => {
    mockCompletion(payload);
    const provider = new OpenAiProvider(makeFallback());

    const english = await provider.reviewTrade("u1", input, "en");
    mockCompletion(persianPayload);
    const persian = await provider.reviewTrade("u1", input, "fa");
    const again = await provider.reviewTrade("u1", input, "fa");

    expect(english.summary).toBe("Process review.");
    expect(persian.summary).toBe(persianPayload.summary);
    expect(again.summary).toBe(persianPayload.summary);
    expect(fetch).toHaveBeenCalledTimes(1); // the English answer came from the first mock; the two Persian reads share one call
  });

  it("puts the disclaimer in the language of the answer, also for a cached answer", async () => {
    mockCompletion(persianPayload);
    const provider = new OpenAiProvider(makeFallback());

    const first = await provider.reviewTrade("u1", input, "fa");
    const cached = await provider.reviewTrade("u1", input, "fa");
    expect(first.disclaimer).toBe(canonicalAiDisclaimer("fa"));
    expect(cached.disclaimer).toBe(canonicalAiDisclaimer("fa"));

    mockCompletion(payload);
    const english = await provider.reviewTrade("u1", { ...input, symbol: "GBPUSD" });
    expect(english.disclaimer).toBe(CANONICAL_AI_DISCLAIMER);
  });

  it("falls back to the local coach in the same language", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const fallback = makeFallback();
    const provider = new OpenAiProvider(fallback);

    await provider.reviewTrade("u1", input, "fa");
    await provider.journalInsights("u1", "fa");
    await provider.weeklyReview("u1", "learning", "fa");
    await provider.strategyReview("u1", undefined, "learning", "fa");
    await provider.newsSummary("u1", "learning", "fa");

    expect(fallback.reviewTrade).toHaveBeenCalledWith("u1", input, "fa");
    expect(fallback.journalInsights).toHaveBeenCalledWith("u1", "fa");
    expect(fallback.weeklyReview).toHaveBeenCalledWith("u1", "learning", "fa");
    expect(fallback.strategyReview).toHaveBeenCalledWith("u1", undefined, "learning", "fa");
    expect(fallback.newsSummary).toHaveBeenCalledWith("u1", "learning", "fa");
  });

  it("falls back when a Persian answer breaks the educational scope", async () => {
    mockCompletion({ ...persianPayload, summary: "این معامله سود تضمینی دارد." });
    const fallback = makeFallback();

    const result = await new OpenAiProvider(fallback).reviewTrade("u1", input, "fa");

    expect(result).toBe(sentinel);
  });
});

describe("OpenAiProvider with no closed trades", () => {
  beforeEach(() => {
    __resetMemoryStore();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("AI_DAILY_CALL_CAP", "50");
    vi.mocked(getTradeMetrics).mockResolvedValue(metrics(0) as never);
    mockCompletion(payload);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(["en", "fa"] as const)("does not ask the model to review nothing (%s): same answer as the local coach, no call, no quota used", async (locale) => {
    const fallback = makeFallback();
    const provider = new OpenAiProvider(fallback);
    const local = new LocalAiProvider();

    expect(await provider.journalInsights("u1", locale)).toEqual(await local.journalInsights("u1", locale));
    expect(await provider.weeklyReview("u1", "learning", locale)).toEqual(await local.weeklyReview("u1", "learning", locale));
    expect(await provider.weeklyReview("u1", "professional_coach", locale)).toEqual(await local.weeklyReview("u1", "professional_coach", locale));
    expect(fetch).not.toHaveBeenCalled();
    expect(fallback.journalInsights).not.toHaveBeenCalled();
    expect(fallback.weeklyReview).not.toHaveBeenCalled();
  });

  it("says so in the words of the local coach", async () => {
    const answer = await new OpenAiProvider(makeFallback()).journalInsights("u1");

    expect(answer.summary).toMatch(/not enough data yet/i);
    expect(answer.mode).toBe("professional_coach");
  });

  it("asks the model again once there is a closed trade", async () => {
    vi.mocked(getTradeMetrics).mockResolvedValue(metrics(1) as never);
    mockCompletion(payload);

    const answer = await new OpenAiProvider(makeFallback()).journalInsights("u1");

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(answer.summary).toBe("Process review.");
  });
});
