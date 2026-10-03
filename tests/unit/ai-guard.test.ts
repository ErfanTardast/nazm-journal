import { describe, expect, it } from "vitest";
import { buildRefusalResponse, CANONICAL_AI_DISCLAIMER, productScopeForbiddenPatterns, sanitizeAiResponse } from "@/lib/ai/guard";
import type { AiResponse } from "@/lib/services/ai";
import {
  localJournalInsights,
  localNewsSummary,
  localStrategyReview,
  localTradeReview,
  localWeeklyReview,
  notEnoughDataYet,
  type CoachMetrics,
  type TradeFacts
} from "@/lib/services/ai/local-copy";

const TATWEEL = String.fromCodePoint(0x640);
const TANWIN = String.fromCodePoint(0x64b);

function response(partial: Partial<AiResponse>): AiResponse {
  return {
    disclaimer: CANONICAL_AI_DISCLAIMER,
    mode: "professional_coach",
    summary: "",
    observations: [],
    risks: [],
    nextActions: [],
    ...partial
  };
}

describe("AI output guard", () => {
  it("passes scope-safe output", () => {
    expect(sanitizeAiResponse(response({ summary: "Review your risk per trade and rule adherence." })).ok).toBe(true);
  });

  it("rejects certainty / profit-promise language", () => {
    expect(sanitizeAiResponse(response({ summary: "This setup offers guaranteed profit." })).ok).toBe(false);
    expect(sanitizeAiResponse(response({ observations: ["The price will rise next week."] })).ok).toBe(false);
    expect(sanitizeAiResponse(response({ nextActions: ["Follow this trading signal to buy."] })).ok).toBe(false);
  });

  it("rejects certainty, signal and advice language written in Persian", () => {
    expect(sanitizeAiResponse(response({ summary: "این معامله سود تضمینی دارد." })).ok).toBe(false);
    expect(sanitizeAiResponse(response({ observations: ["قیمت هفته آینده بالا خواهد رفت."] })).ok).toBe(false);
    expect(sanitizeAiResponse(response({ nextActions: ["این یک سیگنال خرید است."] })).ok).toBe(false);
    expect(sanitizeAiResponse(response({ nextActions: ["همین حالا بخرید."] })).ok).toBe(false);
    expect(sanitizeAiResponse(response({ risks: ["این ستاپ بدون ریسک است."] })).ok).toBe(false);
    expect(sanitizeAiResponse(response({ summary: "این یک مشاوره مالی است." })).ok).toBe(false);
    expect(sanitizeAiResponse(response({ observations: ["قیمت هدف ۷۰۰۰۰ دلار است."] })).ok).toBe(false);
    expect(sanitizeAiResponse(response({ nextActions: ["حتماً سود می‌کنید."] })).ok).toBe(false);
  });

  it("rejects the common Persian forms of advice and prediction: compound verbs, clitics, present tense used for the future", () => {
    const BLOCKED = [
      "پیشنهاد می‌کنم همین حالا خرید کنید.",
      "قیمت به زودی بالا می‌رود.",
      "این ارز رشد خواهد کرد.",
      "حتما وارد معامله خرید شوید.",
      "باید لانگ بگیرید.",
      "فردا قیمت پایین میره.",
      "قیمت هفته آینده به ۷۰ هزار می‌رسد.",
      "قیمت به ۷۰ هزار خواهد رسید.",
      "امروز فروش کنید.",
      "همین حالا وارد شورت شوید.",
      "شورت بزنید و صبر کنید.",
      "بخرین و نگه دارید.",
      "بازار به زودی ریزش می‌کند.",
      "قطعا وارد شوید.",
      // clitics, "open a position" and the other ways of saying the same
      "بخریدش.",
      "بفروشینش.",
      "یک پوزیشن لانگ باز کنید.",
      "معامله خرید باز کنید.",
      "قیمت فردا می‌ریزد.",
      "فردا می‌رود بالا.",
      "قیمت صعودی خواهد بود.",
      "روند نزولی خواهد شد.",
      // an if-clause or a "before you" clause is not an excuse for a real instruction
      "اگر می‌خواهید سود کنید، همین حالا بخرید.",
      "اگر بخرید، سود می‌کنید.",
      "پیش از آنکه دیر شود، بخرید.",
      "چون قیمت فردا بالا می‌رود، همین حالا خرید کنید."
    ];
    for (const sentence of BLOCKED) {
      expect(sanitizeAiResponse(response({ nextActions: [sentence] })).ok, sentence).toBe(false);
    }
  });

  it("rejects the same Persian output typed with Arabic letters (ي, ك), diacritics or tatweel", () => {
    const arabic = (text: string) => text.replace(/ی/g, "\u064A").replace(/ک/g, "\u0643");
    expect(sanitizeAiResponse(response({ summary: arabic("پیشنهاد می‌کنم همین حالا خرید کنید.") })).ok).toBe(false);
    expect(sanitizeAiResponse(response({ summary: arabic("این سیگنال خرید است.") })).ok).toBe(false);
    expect(sanitizeAiResponse(response({ summary: arabic("باید لانگ بگیرید.") })).ok).toBe(false);
    expect(sanitizeAiResponse(response({ summary: `قیمت ب${TATWEEL}ه زودی بالا می‌رود.` })).ok).toBe(false);
    expect(sanitizeAiResponse(response({ summary: "قطعا سود می‌کنید." })).ok).toBe(false);
    expect(sanitizeAiResponse(response({ summary: `قطعا${TANWIN} سود می‌کنید.` })).ok).toBe(false);
  });

  it("passes Persian coaching language that talks about behaviour, not about where price goes", () => {
    const ALLOWED = [
      "هر وقت قیمت بالا می‌رود هیجانی می‌شوید؛ این الگو را در ژورنال علامت بزنید.",
      "وقتی قیمت به حمایت می‌رسد، پیش از ورود چک‌لیست را بخوانید.",
      "پیش از هر خرید، ریسک را بنویسید و حد ضرر را مشخص کنید.",
      "برای وارد کردن معاملات، فایل MT5 را انتخاب کنید.",
      "ورود به حساب با برنامه احراز هویت انجام می‌شود.",
      "این هفته سه معامله بعد از ضرر باز شد؛ مرور کنید چرا.",
      "پیش از آنکه وارد معامله شوید، چک‌لیست را بخوانید.",
      "قبل از اینکه وارد معامله شوید، حد ضرر را بنویسید.",
      "اگر باز هم بدون پلن خرید کنید، آن را نقض قانون علامت بزنید.",
      "حتماً وارد ژورنال کنید که چرا زود خارج شدید.",
      "فردا وقتی قیمت بالا می‌رود هیجانی نشوید و به پلن پایبند بمانید.",
      "هر بار که قیمت می‌ریزد، اول نفس بکشید و بعد پلن را بخوانید."
    ];
    for (const sentence of ALLOWED) {
      expect(sanitizeAiResponse(response({ observations: [sentence] })).ok, sentence).toBe(true);
    }
  });

  it("passes Persian process language", () => {
    expect(
      sanitizeAiResponse(
        response({
          summary: "مرور فرایند: ریسک هر معامله و پایبندی به قوانین را بسنجید.",
          observations: ["حد ضرر تعریف شده است و خروج را می‌توان با برنامه مقایسه کرد."],
          nextActions: ["بخرم یا نه، سؤال این مرور نیست؛ درس این معامله را بنویسید."]
        })
      ).ok
    ).toBe(true);
  });

  it("rejects out-of-scope product language", () => {
    expect(sanitizeAiResponse(response({ risks: ["Use copy trading to mirror others."] })).ok).toBe(false);
  });

  it("exposes the product-scope pattern list", () => {
    expect(productScopeForbiddenPatterns.some((p) => p.test("guaranteed profit"))).toBe(true);
  });
});

const metricsFor = (drawdownR: number): CoachMetrics => ({
  totalTrades: 40,
  winRate: 0.45,
  expectancy: 12.5,
  profitFactor: 1.3,
  netPnl: 480,
  averageR: 0.3,
  maxDrawdownR: drawdownR
});
const trade = (partial: Partial<TradeFacts>): TradeFacts => ({
  symbol: "EURUSD",
  side: "long",
  mode: "professional_coach",
  rewardToRisk: 2,
  hasExit: true,
  hasStop: true,
  ...partial
});

/** Every answer the built-in coach can give, in one language. */
function builtInAnswers(locale: "en" | "fa"): { name: string; answer: AiResponse }[] {
  const answers: { name: string; answer: AiResponse }[] = [];
  for (const mode of ["professional_coach", "learning"] as const) {
    answers.push({ name: `not enough data (${mode})`, answer: notEnoughDataYet(mode, locale) });
    answers.push({ name: `news (${mode})`, answer: localNewsSummary(mode, locale) });
    answers.push({ name: `general strategy (${mode})`, answer: localStrategyReview(undefined, mode, locale) });
    answers.push({ name: `strategy (${mode})`, answer: localStrategyReview("strat_1", mode, locale) });
    for (const drawdown of [2, 12]) {
      answers.push({ name: `weekly ${drawdown}R (${mode})`, answer: localWeeklyReview(metricsFor(drawdown), mode, locale) });
    }
    for (const side of ["long", "short"] as const) {
      for (const hasStop of [true, false]) {
        for (const hasExit of [true, false]) {
          for (const rewardToRisk of [2, null]) {
            answers.push({
              name: `trade ${side} stop=${hasStop} exit=${hasExit} rr=${rewardToRisk} (${mode})`,
              answer: localTradeReview(trade({ side, hasStop, hasExit, rewardToRisk, mode }), locale)
            });
          }
        }
      }
    }
  }
  for (const drawdown of [2, 12]) {
    answers.push({ name: `insights ${drawdown}R`, answer: localJournalInsights(metricsFor(drawdown), locale) });
  }
  answers.push({ name: "insights, no losses", answer: localJournalInsights({ ...metricsFor(2), profitFactor: Number.POSITIVE_INFINITY }, locale) });
  answers.push({ name: "refusal (coach)", answer: buildRefusalResponse("professional_coach", locale) });
  answers.push({ name: "refusal (learning)", answer: buildRefusalResponse("learning", locale) });
  return answers;
}

const allText = (answers: { answer: AiResponse }[]): string =>
  answers.flatMap(({ answer }) => [answer.summary, ...answer.observations, ...answer.risks, ...answer.nextActions]).join("\n");

describe("the built-in coach's own Persian sentences pass the output guard", () => {
  const answers = builtInAnswers("fa");

  it.each(answers)("$name", ({ answer }) => {
    expect(sanitizeAiResponse(answer)).toEqual({ ok: true });
  });

  it("says what the user gets: no developer wording, and plan is پلن", () => {
    const text = allText(answers);

    expect(text).not.toMatch(/محلی|قطعی(?!ت)|توسعه|جایگزین|قاعده‌محور|مخصوص|پرتأثیر/);
    expect(text).not.toMatch(/برنامه(?!‌ریزی)/);
    expect(localNewsSummary("learning", "fa").summary).toBe("خلاصه‌ای از شرایط خبری برای آگاهی از ریسک.");
    // "زمینه" was a word-for-word "context": the news lines say شرایط خبری and خبرها instead
    expect(allText(answers.filter(({ name }) => name.startsWith("news")))).not.toMatch(/(?<!پس‌)زمینه/);
    expect(localNewsSummary("learning", "fa").risks[0]).toBe("شرایط خبری به معنای قطعیت جهت بازار نیست.");
    expect(localNewsSummary("learning", "fa").risks[1]).toBe("دسته‌بندی خبرها را پس‌زمینه‌ای برای مرور بدانید، نه دستور عمل.");
    expect(localNewsSummary("professional_coach", "fa").nextActions[2]).toBe(
      "وقتی خبرها با قوانین‌تان تضاد دارند، ریسک را کم کنید یا از معامله صرف‌نظر کنید."
    );
    expect(localTradeReview(trade({}), "fa").summary).toBe("مرور فرایند معامله EURUSD (لانگ) بر پایه قواعد ثابت مربی.");
  });
});

describe("the built-in coach's English sentences", () => {
  const answers = builtInAnswers("en");

  it.each(answers)("pass the output guard: $name", ({ answer }) => {
    expect(sanitizeAiResponse(answer)).toEqual({ ok: true });
  });

  it("say what the user gets: no implementation notes about providers, fallbacks or local engines", () => {
    expect(allText(answers)).not.toMatch(/fallback|deterministic|local|provider/i);
    expect(localTradeReview(trade({}), "en").summary).toBe("EURUSD long process review, based on the coach's fixed rules.");
    expect(localTradeReview(trade({ side: "short" }), "en").summary).toBe("EURUSD short process review, based on the coach's fixed rules.");
    expect(localNewsSummary("learning", "en").summary).toBe("A summary of the news backdrop, for risk awareness.");
    expect(localNewsSummary("professional_coach", "en").summary).toBe("A summary of the news backdrop, for risk awareness.");
  });
});
