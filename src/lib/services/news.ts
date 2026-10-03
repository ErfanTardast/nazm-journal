import { isDatabaseUnavailableError } from "@/lib/db/errors";
import { prisma } from "@/lib/db/prisma";
import { isHttpNewsConfigured } from "@/lib/env";
import type { Locale } from "@/lib/i18n/locales";
import type { z } from "zod";
import type { newsAnalyzeSchema } from "@/lib/validation/trading";
import { HttpNewsProvider } from "@/lib/services/news/http-provider";

export type LocalNewsItem = {
  title: string;
  source: string;
  url?: string;
  publishedAt: Date;
  language: Locale;
  market: "forex" | "crypto" | "stocks";
  relatedSymbols: string[];
  category:
    | "macro"
    | "central_bank"
    | "inflation"
    | "employment"
    | "crypto_regulation"
    | "exchange_event"
    | "earnings"
    | "company_news"
    | "geopolitical"
    | "risk_event"
    | "other";
  importance: "low" | "medium" | "high" | "critical";
  sentiment: string;
  summary: string;
  possibleAffectedAssets: string[];
  riskNotes: string[];
};

export interface NewsProvider {
  list(locale?: Locale): Promise<LocalNewsItem[]>;
}

export class LocalNewsProvider implements NewsProvider {
  async list(locale: Locale = "en") {
    const en: LocalNewsItem[] = [
      {
        title: "Central bank remarks may increase FX volatility",
        source: "Nazm sample",
        publishedAt: new Date("2026-06-10T08:00:00.000Z"),
        language: "en",
        market: "forex",
        relatedSymbols: ["EURUSD", "GBPUSD", "USDJPY"],
        category: "central_bank",
        importance: "high",
        sentiment: "caution",
        summary: "Major pairs may see wider ranges around central bank commentary.",
        possibleAffectedAssets: ["EURUSD", "GBPUSD", "DXY"],
        riskNotes: ["Review calendar timing", "Avoid oversized risk near speeches"]
      },
      {
        title: "Crypto regulation headline keeps BTC plans context-sensitive",
        source: "Nazm sample",
        publishedAt: new Date("2026-06-10T07:20:00.000Z"),
        language: "en",
        market: "crypto",
        relatedSymbols: ["BTCUSDT", "ETHUSDT"],
        category: "crypto_regulation",
        importance: "medium",
        sentiment: "mixed",
        summary: "Regulatory headlines can change short-term sentiment without producing a guaranteed direction.",
        possibleAffectedAssets: ["BTCUSDT", "ETHUSDT"],
        riskNotes: ["Check position size", "Wait for planned confirmation"]
      }
    ];

    const fa: LocalNewsItem[] = [
      {
        title: "اظهارنظر بانک مرکزی می‌تواند نوسان جفت‌ارزها را افزایش دهد",
        source: "نمونه آموزشی اپ نظم",
        publishedAt: new Date("2026-06-10T08:00:00.000Z"),
        language: "fa",
        market: "forex",
        relatedSymbols: ["EURUSD", "GBPUSD", "USDJPY"],
        category: "central_bank",
        importance: "high",
        sentiment: "احتیاط",
        summary: "پیش از نوشتن پلن برای جفت‌ارزهای اصلی، زمان رویداد و میزان ریسک را بررسی کنید.",
        possibleAffectedAssets: ["EURUSD", "GBPUSD", "DXY"],
        riskNotes: ["تقویم اقتصادی را بررسی کنید", "نزدیک سخنرانی‌ها ریسک را بزرگ نکنید"]
      }
    ];

    return locale === "fa" ? fa : en;
  }
}

let cachedNewsProvider: NewsProvider | undefined;

export function getNewsProvider(): NewsProvider {
  if (isHttpNewsConfigured()) {
    cachedNewsProvider ??= new HttpNewsProvider(new LocalNewsProvider());
    return cachedNewsProvider;
  }
  return new LocalNewsProvider();
}

export async function listNews(locale: Locale = "en") {
  try {
    const stored = await prisma.newsItem.findMany({
      where: { language: locale },
      orderBy: { publishedAt: "desc" },
      take: 20
    });
    if (stored.length > 0) {
      return stored;
    }
  } catch (error) {
    if (!isDatabaseUnavailableError(error)) {
      throw error;
    }
  }

  return getNewsProvider().list(locale);
}

export async function analyzeNews(userId: string, input: z.infer<typeof newsAnalyzeSchema>) {
  const item = input.newsItemId
    ? await prisma.newsItem.findUnique({ where: { id: input.newsItemId } })
    : null;
  const text = item?.summary ?? input.text ?? "";
  const market = item?.market ?? input.market ?? inferMarket(text);
  const category = item?.category ?? inferCategory(text);
  const impactLevel = item?.importance ?? inferImportance(text);
  const cautionNotes = buildCautionNotes(market, input.language);
  const reviewChecklist =
    input.language === "fa"
      ? ["تقویم و اخبار را بررسی کنید", "ریسک معامله را با قوانین خودتان مقایسه کنید", "اگر پلن شما با خبر تضاد دارد، معامله را بازبینی کنید"]
      : ["Review calendar and context", "Compare planned risk with your own rules", "Re-check the plan if news conflicts with it"];

  const analysis = {
    whatHappened: text,
    affectedMarket: market,
    category,
    impactLevel,
    cautionNotes,
    conflicts: input.plannedTradeId ? { plannedTradeId: input.plannedTradeId, needsReview: true } : {},
    reviewChecklist,
    disclaimer:
      "This context analysis is educational. It does not predict direction, provide financial advice, or create market certainty."
  };

  if (item) {
    await prisma.newsAnalysis.create({
      data: {
        userId,
        newsItemId: item.id,
        mode: input.mode,
        whatHappened: analysis.whatHappened,
        affectedMarket: analysis.affectedMarket,
        impactLevel: analysis.impactLevel,
        cautionNotes: analysis.cautionNotes,
        conflicts: analysis.conflicts,
        reviewChecklist: analysis.reviewChecklist
      }
    });
  }

  return analysis;
}

export function inferMarket(text: string): "forex" | "crypto" | "stocks" {
  const value = text.toLowerCase();
  if (/(btc|eth|crypto|exchange|token)/.test(value)) return "crypto";
  if (/(earnings|stock|shares|company)/.test(value)) return "stocks";
  return "forex";
}

export function inferCategory(text: string): LocalNewsItem["category"] {
  const value = text.toLowerCase();
  if (/inflation|cpi/.test(value)) return "inflation";
  if (/employment|jobs|payroll/.test(value)) return "employment";
  if (/central bank|rate|fed|ecb/.test(value)) return "central_bank";
  if (/earnings/.test(value)) return "earnings";
  if (/regulation/.test(value)) return "crypto_regulation";
  return "macro";
}

export function inferImportance(text: string): "low" | "medium" | "high" | "critical" {
  const value = text.toLowerCase();
  if (/crisis|shock|emergency/.test(value)) return "critical";
  if (/rate|inflation|employment|regulation|earnings/.test(value)) return "high";
  return "medium";
}

function buildCautionNotes(market: string, locale: Locale) {
  if (locale === "fa") {
    return [`بازار ${market} ممکن است نوسان بیشتری داشته باشد.`, "این تحلیل فقط برای آگاهی و مرور ریسک است."];
  }
  return [`${market} may experience higher context-driven volatility.`, "This analysis is for risk awareness and review only."];
}
