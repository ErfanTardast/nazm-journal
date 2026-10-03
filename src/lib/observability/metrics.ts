import { cacheAdd, cacheGetCounter, cacheIncrement } from "@/lib/cache/store";

const WINDOW = 86400; // 24-hour rolling bucket

function dailyKey(name: string) {
  const day = new Date().toISOString().slice(0, 10);
  return `metrics:${name}:${day}`;
}

export async function recordProviderCall(provider: "ai" | "news"): Promise<void> {
  await cacheIncrement(dailyKey(`${provider}:calls`), WINDOW);
}

export async function recordProviderError(provider: "ai" | "news"): Promise<void> {
  await cacheIncrement(dailyKey(`${provider}:errors`), WINDOW);
}

export async function recordProviderFallback(provider: "ai" | "news"): Promise<void> {
  await cacheIncrement(dailyKey(`${provider}:fallbacks`), WINDOW);
}

export async function recordAiTokens(count: number): Promise<void> {
  if (count > 0) await cacheAdd(dailyKey("ai:tokens"), count, WINDOW);
}

export type ProviderMetrics = {
  ai: { calls: number; errors: number; fallbacks: number; tokens: number };
  news: { calls: number; errors: number; fallbacks: number };
};

export async function getProviderMetrics(): Promise<ProviderMetrics> {
  const [aiCalls, aiErrors, aiFallbacks, aiTokens, newsCalls, newsErrors, newsFallbacks] = await Promise.all([
    cacheGetCounter(dailyKey("ai:calls")),
    cacheGetCounter(dailyKey("ai:errors")),
    cacheGetCounter(dailyKey("ai:fallbacks")),
    cacheGetCounter(dailyKey("ai:tokens")),
    cacheGetCounter(dailyKey("news:calls")),
    cacheGetCounter(dailyKey("news:errors")),
    cacheGetCounter(dailyKey("news:fallbacks"))
  ]);

  return {
    ai: { calls: aiCalls, errors: aiErrors, fallbacks: aiFallbacks, tokens: aiTokens },
    news: { calls: newsCalls, errors: newsErrors, fallbacks: newsFallbacks }
  };
}
