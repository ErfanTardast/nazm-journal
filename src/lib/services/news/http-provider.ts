import { getNewsApiKey, getNewsApiUrl, getNewsCacheTtlSeconds } from "@/lib/env";
import { fetchJson } from "@/lib/providers/http";
import { cacheGet, cacheSet } from "@/lib/cache/store";
import { recordProviderCall, recordProviderError, recordProviderFallback } from "@/lib/observability/metrics";
import type { Locale } from "@/lib/i18n/locales";
import type { LocalNewsItem, NewsProvider } from "@/lib/services/news";
import { inferCategory, inferImportance, inferMarket } from "@/lib/services/news";

type FeedArticle = {
  title?: string;
  description?: string;
  url?: string;
  publishedAt?: string;
  source?: { name?: string } | string;
};

type FeedResponse = {
  articles?: FeedArticle[];
  items?: FeedArticle[];
};

export function mapFeedToNewsItems(articles: FeedArticle[], locale: Locale): LocalNewsItem[] {
  return articles
    .filter((a) => Boolean(a.title))
    .map((a): LocalNewsItem => {
      const text = `${a.title ?? ""} ${a.description ?? ""}`;
      const sourceName = typeof a.source === "string" ? a.source : (a.source?.name ?? "HTTP Feed");
      return {
        title: a.title!,
        source: sourceName,
        url: a.url,
        publishedAt: a.publishedAt ? new Date(a.publishedAt) : new Date(),
        language: locale,
        market: inferMarket(text),
        relatedSymbols: [],
        category: inferCategory(text),
        importance: inferImportance(text),
        sentiment: "neutral",
        summary: a.description ?? a.title!,
        possibleAffectedAssets: [],
        riskNotes: []
      };
    });
}

export class HttpNewsProvider implements NewsProvider {
  constructor(private readonly fallback: NewsProvider) {}

  async list(locale: Locale = "en"): Promise<LocalNewsItem[]> {
    const cacheKey = `news:http:${locale}`;
    const ttl = getNewsCacheTtlSeconds();

    const cached = await cacheGet(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as Array<Omit<LocalNewsItem, "publishedAt"> & { publishedAt: string }>;
      return parsed.map((i) => ({ ...i, publishedAt: new Date(i.publishedAt) }));
    }

    try {
      void recordProviderCall("news");
      const url = new URL(getNewsApiUrl());
      const key = getNewsApiKey();
      if (key) {
        url.searchParams.set("apiKey", key);
      }

      const feed = await fetchJson<FeedResponse>(url.toString(), { timeoutMs: 10_000 });
      const articles = feed.articles ?? feed.items ?? [];
      if (articles.length === 0) {
        void recordProviderFallback("news");
        return this.fallback.list(locale);
      }

      const items = mapFeedToNewsItems(articles, locale);
      await cacheSet(cacheKey, JSON.stringify(items), ttl);
      return items;
    } catch {
      void recordProviderError("news");
      void recordProviderFallback("news");
      return this.fallback.list(locale);
    }
  }
}
