import { getTradeMetrics } from "./trades";
import { isOpenAiConfigured } from "@/lib/env";
import type { Locale } from "@/lib/i18n/locales";
import { OpenAiProvider } from "./ai/openai-provider";
import {
  localJournalInsights,
  localNewsSummary,
  localStrategyReview,
  localTradeReview,
  localWeeklyReview,
  notEnoughDataYet
} from "./ai/local-copy";
import type { z } from "zod";
import type { aiReviewTradeSchema } from "@/lib/validation/trading";

export type AiResponse = {
  disclaimer: string;
  mode: "professional_coach" | "learning";
  summary: string;
  observations: string[];
  risks: string[];
  nextActions: string[];
};

/** `locale` is the language of the answer; English when a caller gives none. */
export interface AiProvider {
  reviewTrade(userId: string, input: z.infer<typeof aiReviewTradeSchema>, locale?: Locale): Promise<AiResponse>;
  journalInsights(userId: string, locale?: Locale): Promise<AiResponse>;
  weeklyReview(userId: string, mode: "professional_coach" | "learning", locale?: Locale): Promise<AiResponse>;
  strategyReview(userId: string, strategyId: string | undefined, mode: "professional_coach" | "learning", locale?: Locale): Promise<AiResponse>;
  newsSummary(userId: string, mode: "professional_coach" | "learning", locale?: Locale): Promise<AiResponse>;
}

export class LocalAiProvider implements AiProvider {
  async reviewTrade(_userId: string, input: z.infer<typeof aiReviewTradeSchema>, locale: Locale = "en"): Promise<AiResponse> {
    const riskDistance = input.stopLoss ? Math.abs(input.entryPrice - input.stopLoss) : null;
    const rewardDistance = input.takeProfit ? Math.abs(input.takeProfit - input.entryPrice) : null;
    const rr = riskDistance && rewardDistance ? rewardDistance / riskDistance : null;

    return localTradeReview(
      { symbol: input.symbol, side: input.side, mode: input.mode, rewardToRisk: rr, hasExit: Boolean(input.exitPrice), hasStop: Boolean(input.stopLoss) },
      locale
    );
  }

  async journalInsights(userId: string, locale: Locale = "en"): Promise<AiResponse> {
    const metrics = await getTradeMetrics(userId);
    if (metrics.totalTrades === 0) return notEnoughDataYet("professional_coach", locale);
    return localJournalInsights(metrics, locale);
  }

  async weeklyReview(userId: string, mode: "professional_coach" | "learning", locale: Locale = "en"): Promise<AiResponse> {
    const metrics = await getTradeMetrics(userId);
    if (metrics.totalTrades === 0) return notEnoughDataYet(mode, locale);
    return localWeeklyReview(metrics, mode, locale);
  }

  async strategyReview(
    _userId: string,
    strategyId: string | undefined,
    mode: "professional_coach" | "learning",
    locale: Locale = "en"
  ): Promise<AiResponse> {
    return localStrategyReview(strategyId, mode, locale);
  }

  async newsSummary(_userId: string, mode: "professional_coach" | "learning", locale: Locale = "en"): Promise<AiResponse> {
    return localNewsSummary(mode, locale);
  }
}

let cachedProvider: AiProvider | undefined;

export function getAiProvider(): AiProvider {
  if (isOpenAiConfigured()) {
    cachedProvider ??= new OpenAiProvider(new LocalAiProvider());
    return cachedProvider;
  }
  return new LocalAiProvider();
}
