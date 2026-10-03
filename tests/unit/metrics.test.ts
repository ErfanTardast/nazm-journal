import { beforeEach, describe, expect, it } from "vitest";
import { __resetMemoryStore } from "@/lib/cache/store";
import { getProviderMetrics, recordAiTokens, recordProviderCall, recordProviderError, recordProviderFallback } from "@/lib/observability/metrics";

describe("provider metrics", () => {
  beforeEach(() => __resetMemoryStore());

  it("returns zero counts when no events recorded", async () => {
    const m = await getProviderMetrics();
    expect(m.ai.calls).toBe(0);
    expect(m.ai.errors).toBe(0);
    expect(m.ai.fallbacks).toBe(0);
    expect(m.ai.tokens).toBe(0);
    expect(m.news.calls).toBe(0);
    expect(m.news.errors).toBe(0);
    expect(m.news.fallbacks).toBe(0);
  });

  it("counts AI calls", async () => {
    await recordProviderCall("ai");
    await recordProviderCall("ai");
    const m = await getProviderMetrics();
    expect(m.ai.calls).toBe(2);
  });

  it("counts AI errors and fallbacks independently", async () => {
    await recordProviderError("ai");
    await recordProviderFallback("ai");
    await recordProviderFallback("ai");
    const m = await getProviderMetrics();
    expect(m.ai.errors).toBe(1);
    expect(m.ai.fallbacks).toBe(2);
  });

  it("accumulates AI token usage", async () => {
    await recordAiTokens(150);
    await recordAiTokens(75);
    const m = await getProviderMetrics();
    expect(m.ai.tokens).toBe(225);
  });

  it("counts news provider events separately", async () => {
    await recordProviderCall("news");
    await recordProviderError("news");
    const m = await getProviderMetrics();
    expect(m.news.calls).toBe(1);
    expect(m.news.errors).toBe(1);
    expect(m.ai.calls).toBe(0);
  });
});
