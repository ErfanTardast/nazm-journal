import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpNewsProvider, mapFeedToNewsItems } from "@/lib/services/news/http-provider";
import { __resetMemoryStore } from "@/lib/cache/store";
import type { NewsProvider } from "@/lib/services/news";

const SENTINEL_ITEMS = [
  {
    title: "LOCAL_FALLBACK",
    source: "Local",
    publishedAt: new Date("2026-01-01"),
    language: "en" as const,
    market: "forex" as const,
    relatedSymbols: [],
    category: "other" as const,
    importance: "low" as const,
    sentiment: "neutral",
    summary: "Local fallback item",
    possibleAffectedAssets: [],
    riskNotes: []
  }
];

function makeFallback(): NewsProvider {
  return { list: vi.fn(async () => SENTINEL_ITEMS) };
}

function mockFeedResponse(articles: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ articles })
    })
  );
}

const sampleArticles = [
  {
    title: "Fed raises rates",
    description: "Central bank raises interest rates amid inflation concerns.",
    url: "https://example.com/fed",
    publishedAt: "2026-06-18T10:00:00Z",
    source: { name: "Reuters" }
  }
];

describe("mapFeedToNewsItems", () => {
  it("maps articles to LocalNewsItem shape", () => {
    const items = mapFeedToNewsItems(sampleArticles, "en");
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Fed raises rates");
    expect(items[0].source).toBe("Reuters");
    expect(items[0].language).toBe("en");
    expect(items[0].category).toBe("inflation");
    expect(items[0].importance).toBe("high");
    expect(items[0].market).toBe("forex");
    expect(items[0].publishedAt).toBeInstanceOf(Date);
  });

  it("skips articles without a title", () => {
    const items = mapFeedToNewsItems([{ description: "No title here" }], "en");
    expect(items).toHaveLength(0);
  });

  it("accepts a string source field", () => {
    const items = mapFeedToNewsItems([{ title: "BTC news", source: "CoinDesk" }], "en");
    expect(items[0].source).toBe("CoinDesk");
  });

  it("defaults source to HTTP Feed when absent", () => {
    const items = mapFeedToNewsItems([{ title: "Mystery article" }], "en");
    expect(items[0].source).toBe("HTTP Feed");
  });

  it("infers crypto market from title keywords", () => {
    const items = mapFeedToNewsItems([{ title: "ETH token hits record" }], "en");
    expect(items[0].market).toBe("crypto");
  });
});

describe("HttpNewsProvider", () => {
  beforeEach(() => {
    __resetMemoryStore();
    vi.stubEnv("NEWS_PROVIDER", "http");
    vi.stubEnv("NEWS_API_URL", "https://news.example.com/api");
    vi.stubEnv("NEWS_API_KEY", "test-key");
    vi.stubEnv("NEWS_CACHE_TTL_SECONDS", "600");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns mapped items from the HTTP feed", async () => {
    mockFeedResponse(sampleArticles);
    const provider = new HttpNewsProvider(makeFallback());
    const items = await provider.list("en");

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Fed raises rates");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns Date objects for publishedAt after cache round-trip", async () => {
    mockFeedResponse(sampleArticles);
    const provider = new HttpNewsProvider(makeFallback());
    await provider.list("en");
    const second = await provider.list("en");

    expect(second[0].publishedAt).toBeInstanceOf(Date);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("serves identical locale requests from cache without a second fetch", async () => {
    mockFeedResponse(sampleArticles);
    const provider = new HttpNewsProvider(makeFallback());
    const first = await provider.list("en");
    const second = await provider.list("en");

    expect(first[0].title).toBe(second[0].title);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to local when the HTTP call fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const fallback = makeFallback();
    const provider = new HttpNewsProvider(fallback);
    const items = await provider.list("en");

    expect(items).toBe(SENTINEL_ITEMS);
    expect(fallback.list).toHaveBeenCalledTimes(1);
  });

  it("falls back to local when the feed returns no articles", async () => {
    mockFeedResponse([]);
    const fallback = makeFallback();
    const provider = new HttpNewsProvider(fallback);
    const items = await provider.list("en");

    expect(items).toBe(SENTINEL_ITEMS);
    expect(fallback.list).toHaveBeenCalledTimes(1);
  });

  it("does not share cache between locales", async () => {
    mockFeedResponse(sampleArticles);
    const provider = new HttpNewsProvider(makeFallback());
    await provider.list("en");
    await provider.list("fa");

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
