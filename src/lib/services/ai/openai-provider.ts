import { createHash } from "node:crypto";
import { cacheGet, cacheIncrement, cacheSet } from "@/lib/cache/store";
import { getAiDailyCallCap, getOpenAiBaseUrl, getOpenAiKey, getOpenAiModel } from "@/lib/env";
import { canonicalAiDisclaimer, sanitizeAiResponse } from "@/lib/ai/guard";
import { fetchJson } from "@/lib/providers/http";
import type { Locale } from "@/lib/i18n/locales";
import { notEnoughDataYet } from "@/lib/services/ai/local-copy";
import { getTradeMetrics } from "@/lib/services/trades";
import { recordAiTokens, recordProviderCall, recordProviderError, recordProviderFallback } from "@/lib/observability/metrics";
import type { AiProvider, AiResponse } from "@/lib/services/ai";
import type { z } from "zod";
import type { aiReviewTradeSchema } from "@/lib/validation/trading";

type Mode = "professional_coach" | "learning";
type TradeReviewInput = z.infer<typeof aiReviewTradeSchema>;

const CACHE_TTL_SECONDS = 60 * 60; // identical requests reuse a result for an hour
const DAY_SECONDS = 24 * 60 * 60;
const REQUEST_TIMEOUT_MS = 10_000;

const responseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "observations", "risks", "nextActions"],
  properties: {
    summary: { type: "string" },
    observations: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    nextActions: { type: "array", items: { type: "string" } }
  }
} as const;

const guardrails = [
  "You are an educational trading-journal review assistant for a second-brain app.",
  "Your role is to review process quality, risk discipline, and behavior - never to predict markets.",
  "Strict rules: do not predict price or direction; do not give personalized advice; never use",
  "certainty or profit-promise language; do not reference order execution, brokers, or live signals.",
  "Frame everything as review questions and process observations. Keep each string concise."
].join(" ");

/** Added to the system message when the answer is for a Persian screen; the rules above still apply in full. */
const persianInstruction =
  "Write every string value in natural, everyday Persian (Farsi) with Persian punctuation. " +
  "Keep symbols, numbers and the letter R as they are.";

function systemPrompt(locale: Locale): string {
  return locale === "fa" ? `${guardrails} ${persianInstruction}` : guardrails;
}

type ChatCompletion = {
  choices?: { message?: { content?: string } }[];
  usage?: { total_tokens?: number };
};

export class OpenAiProvider implements AiProvider {
  constructor(private readonly fallback: AiProvider) {}

  async reviewTrade(userId: string, input: TradeReviewInput, locale: Locale = "en"): Promise<AiResponse> {
    const rr = input.stopLoss && input.takeProfit ? Math.abs(input.takeProfit - input.entryPrice) / Math.abs(input.entryPrice - input.stopLoss) : null;
    const prompt = [
      `Review this ${input.side} trade on ${input.symbol}.`,
      `Entry ${input.entryPrice}, stop ${input.stopLoss ?? "none"}, target ${input.takeProfit ?? "none"}, exit ${input.exitPrice ?? "none"}.`,
      rr ? `Planned reward-to-risk is ${rr.toFixed(2)}R.` : "Reward-to-risk is not computable from the given levels.",
      input.notes ? `Trader notes: ${input.notes}` : "No trader notes provided.",
      "Produce a process review: a summary, observations, risks, and next actions."
    ].join("\n");

    return this.generate({
      userId,
      mode: input.mode,
      locale,
      cacheKeyParts: ["trade-review", locale, input.mode, input.symbol, input.side, input.entryPrice, input.stopLoss, input.takeProfit, input.exitPrice, input.notes],
      prompt,
      fallback: () => this.fallback.reviewTrade(userId, input, locale)
    });
  }

  async journalInsights(userId: string, locale: Locale = "en"): Promise<AiResponse> {
    const metrics = await getTradeMetrics(userId);
    // Nothing closed yet: there is nothing to review, so do not ask the model or use up the quota.
    if (metrics.totalTrades === 0) return notEnoughDataYet("professional_coach", locale);
    const prompt = [
      `Closed trades: ${metrics.totalTrades}. Win rate: ${(metrics.winRate * 100).toFixed(1)}%.`,
      `Expectancy: ${metrics.expectancy.toFixed(2)}. Profit factor: ${Number.isFinite(metrics.profitFactor) ? metrics.profitFactor.toFixed(2) : "n/a"}. Max drawdown: ${metrics.maxDrawdownAmount.toFixed(2)} (${metrics.maxDrawdownR.toFixed(1)}R).`,
      "Give journal insights about behavior and risk discipline as review observations."
    ].join("\n");

    return this.generate({
      userId,
      mode: "professional_coach",
      locale,
      cacheKeyParts: ["journal-insights", locale, metrics.totalTrades, metrics.winRate, metrics.expectancy, metrics.maxDrawdownAmount, metrics.maxDrawdownR],
      prompt,
      fallback: () => this.fallback.journalInsights(userId, locale)
    });
  }

  async weeklyReview(userId: string, mode: Mode, locale: Locale = "en"): Promise<AiResponse> {
    const metrics = await getTradeMetrics(userId);
    if (metrics.totalTrades === 0) return notEnoughDataYet(mode, locale);
    const prompt = [
      `Weekly process review (${mode}).`,
      `Closed trades: ${metrics.totalTrades}. Net P&L: ${metrics.netPnl.toFixed(2)}. Average R: ${metrics.averageR.toFixed(2)}. Max drawdown: ${metrics.maxDrawdownAmount.toFixed(2)} (${metrics.maxDrawdownR.toFixed(1)}R).`,
      "Summarize the week as process lessons, risks to watch, and next actions."
    ].join("\n");

    return this.generate({
      userId,
      mode,
      locale,
      cacheKeyParts: ["weekly-review", locale, mode, metrics.totalTrades, metrics.netPnl, metrics.averageR, metrics.maxDrawdownAmount, metrics.maxDrawdownR],
      prompt,
      fallback: () => this.fallback.weeklyReview(userId, mode, locale)
    });
  }

  async strategyReview(userId: string, strategyId: string | undefined, mode: Mode, locale: Locale = "en"): Promise<AiResponse> {
    const prompt = [
      `Strategy playbook review (${mode}).`,
      strategyId ? `Strategy id: ${strategyId}.` : "No specific strategy selected; review general playbook discipline.",
      "Suggest checklist and invalidation-rule improvements as review observations."
    ].join("\n");

    return this.generate({
      userId,
      mode,
      locale,
      cacheKeyParts: ["strategy-review", locale, mode, strategyId ?? "general"],
      prompt,
      fallback: () => this.fallback.strategyReview(userId, strategyId, mode, locale)
    });
  }

  async newsSummary(userId: string, mode: Mode, locale: Locale = "en"): Promise<AiResponse> {
    const prompt = [
      `News-context review (${mode}).`,
      "Explain how macro, crypto, and company context should be reviewed for risk awareness.",
      "Output review questions and caution notes, not directional calls."
    ].join("\n");

    return this.generate({
      userId,
      mode,
      locale,
      cacheKeyParts: ["news-summary", locale, mode],
      prompt,
      fallback: () => this.fallback.newsSummary(userId, mode, locale)
    });
  }

  private async generate(params: {
    userId: string;
    mode: Mode;
    locale: Locale;
    cacheKeyParts: unknown[];
    prompt: string;
    fallback: () => Promise<AiResponse>;
  }): Promise<AiResponse> {
    const key = cacheKey(params.cacheKeyParts);

    const cached = await readCachedResponse(key, params.mode, params.locale);
    if (cached) {
      return cached;
    }

    // Per-user daily cap: when exceeded, serve the deterministic local provider.
    const used = await cacheIncrement(`aiusage:${params.userId}:${dayStamp()}`, DAY_SECONDS);
    if (used > getAiDailyCallCap()) {
      return params.fallback();
    }

    try {
      void recordProviderCall("ai");
      const candidate = await this.callOpenAi(params.prompt, params.mode, params.locale);
      const guard = sanitizeAiResponse(candidate);
      if (!guard.ok) {
        void recordProviderFallback("ai");
        return params.fallback();
      }
      await cacheSet(key, JSON.stringify(candidate), CACHE_TTL_SECONDS).catch(() => undefined);
      return candidate;
    } catch {
      void recordProviderError("ai");
      void recordProviderFallback("ai");
      return params.fallback();
    }
  }

  private async callOpenAi(prompt: string, mode: Mode, locale: Locale): Promise<AiResponse> {
    const data = await fetchJson<ChatCompletion>(`${getOpenAiBaseUrl()}/chat/completions`, {
      method: "POST",
      timeoutMs: REQUEST_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getOpenAiKey()}`
      },
      body: JSON.stringify({
        model: getOpenAiModel(),
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt(locale) },
          { role: "user", content: prompt }
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "ai_response", strict: true, schema: responseJsonSchema }
        }
      })
    });

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned no content");
    }
    const tokens = data.usage?.total_tokens ?? 0;
    if (tokens > 0) void recordAiTokens(tokens);
    const parsed = JSON.parse(content) as Partial<AiResponse>;

    return {
      disclaimer: canonicalAiDisclaimer(locale),
      mode,
      summary: String(parsed.summary ?? ""),
      observations: toStringArray(parsed.observations),
      risks: toStringArray(parsed.risks),
      nextActions: toStringArray(parsed.nextActions)
    };
  }
}

async function readCachedResponse(key: string, mode: Mode, locale: Locale): Promise<AiResponse | null> {
  const raw = await cacheGet(key).catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AiResponse;
    return { ...parsed, disclaimer: canonicalAiDisclaimer(locale), mode };
  } catch {
    return null;
  }
}

function cacheKey(parts: unknown[]): string {
  return `ai:${createHash("sha256").update(JSON.stringify(parts)).digest("hex")}`;
}

function dayStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}
