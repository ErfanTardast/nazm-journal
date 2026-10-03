import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAiProvider } from "@/lib/services/ai/openai-provider";
import { CANONICAL_AI_DISCLAIMER } from "@/lib/ai/guard";
import { __resetMemoryStore } from "@/lib/cache/store";
import { getAiProvider, LocalAiProvider, type AiProvider, type AiResponse } from "@/lib/services/ai";
import type { z } from "zod";
import type { aiReviewTradeSchema } from "@/lib/validation/trading";

const input: z.infer<typeof aiReviewTradeSchema> = {
  symbol: "BTCUSDT",
  side: "long",
  entryPrice: 100,
  exitPrice: 110,
  stopLoss: 95,
  takeProfit: 120,
  mode: "learning"
};

const sentinel: AiResponse = {
  disclaimer: "local",
  mode: "learning",
  summary: "LOCAL_FALLBACK",
  observations: [],
  risks: [],
  nextActions: []
};

function makeFallback() {
  return {
    reviewTrade: vi.fn(async () => sentinel),
    journalInsights: vi.fn(async () => sentinel),
    weeklyReview: vi.fn(async () => sentinel),
    strategyReview: vi.fn(async () => sentinel),
    newsSummary: vi.fn(async () => sentinel)
  } satisfies AiProvider;
}

function mockCompletion(payload: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] })
    })
  );
}

const validPayload = { summary: "Process review of the plan.", observations: ["Defined risk."], risks: ["Small sample."], nextActions: ["Log the lesson."] };

describe("OpenAiProvider", () => {
  beforeEach(() => {
    __resetMemoryStore();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_MODEL", "gpt-4o-mini");
    vi.stubEnv("AI_DAILY_CALL_CAP", "50");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns structured output with a server-set disclaimer on success", async () => {
    mockCompletion(validPayload);
    const provider = new OpenAiProvider(makeFallback());
    const result = await provider.reviewTrade("u1", input);

    expect(result.summary).toBe("Process review of the plan.");
    expect(result.observations).toEqual(["Defined risk."]);
    expect(result.disclaimer).toBe(CANONICAL_AI_DISCLAIMER);
    expect(result.mode).toBe("learning");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to local when output violates the safety guard", async () => {
    mockCompletion({ ...validPayload, summary: "This is guaranteed profit." });
    const fallback = makeFallback();
    const provider = new OpenAiProvider(fallback);
    const result = await provider.reviewTrade("u1", { ...input, symbol: "ETHUSDT" });

    expect(result).toBe(sentinel);
    expect(fallback.reviewTrade).toHaveBeenCalledTimes(1);
  });

  it("falls back to local when the API call fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const fallback = makeFallback();
    const provider = new OpenAiProvider(fallback);
    const result = await provider.reviewTrade("u1", { ...input, symbol: "SOLUSDT" });

    expect(result).toBe(sentinel);
  });

  it("serves identical requests from cache without a second API call", async () => {
    mockCompletion(validPayload);
    const provider = new OpenAiProvider(makeFallback());
    const first = await provider.reviewTrade("u1", { ...input, symbol: "ADAUSDT" });
    const second = await provider.reviewTrade("u1", { ...input, symbol: "ADAUSDT" });

    expect(first.summary).toBe(second.summary);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to local once the per-user daily cap is exceeded", async () => {
    vi.stubEnv("AI_DAILY_CALL_CAP", "1");
    mockCompletion(validPayload);
    const fallback = makeFallback();
    const provider = new OpenAiProvider(fallback);

    const first = await provider.reviewTrade("capuser", { ...input, symbol: "AAA" });
    const second = await provider.reviewTrade("capuser", { ...input, symbol: "BBB" });

    expect(first.summary).toBe("Process review of the plan.");
    expect(second).toBe(sentinel);
  });
});

describe("getAiProvider selection", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the local provider when no external provider is configured", () => {
    expect(getAiProvider()).toBeInstanceOf(LocalAiProvider);
  });
});
