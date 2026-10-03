import { canonicalAiDisclaimer } from "@/lib/ai/guard";
import type { Locale } from "@/lib/i18n/locales";
import { formatGeneratedNumber } from "@/lib/services/locale";
import type { AiResponse } from "@/lib/services/ai";

/**
 * The deterministic local coach's sentences, in English and Persian. Educational process review only: no market calls,
 * no signals, no advice (the guard in `@/lib/ai/guard` holds both languages to that). English is the original wording.
 */
type Mode = AiResponse["mode"];
type Body = Omit<AiResponse, "disclaimer" | "mode">;
type Fmt = (value: number, fractionDigits: number) => string;

/** Drawdown worth a risk-rule review: 10R is 10% of an account that risks 1% per trade. */
export const DRAWDOWN_REVIEW_R = 10;

/** The numbers a local trade-history answer is written from. */
export type CoachMetrics = {
  totalTrades: number;
  winRate: number;
  expectancy: number;
  profitFactor: number;
  netPnl: number;
  averageR: number;
  maxDrawdownR: number;
};

/** What a single-trade review is written from. */
export type TradeFacts = {
  symbol: string;
  side: "long" | "short";
  mode: Mode;
  /** Planned reward-to-risk, or null when the levels do not give one. */
  rewardToRisk: number | null;
  hasExit: boolean;
  hasStop: boolean;
};

type Copy = {
  notEnoughData: Body;
  reviewTrade(facts: TradeFacts, f: Fmt): Body;
  journalInsights(metrics: CoachMetrics, f: Fmt): Body;
  weeklyReview(metrics: CoachMetrics, mode: Mode, f: Fmt): Body;
  strategyReview(strategyId: string | undefined): Body;
  newsSummary(mode: Mode): Body;
};

const en: Copy = {
  notEnoughData: {
    summary: "Not enough data yet: there are no closed trades to review.",
    observations: ["Statistics need at least one closed trade in the journal."],
    risks: ["A review of zero trades would only repeat empty numbers, so none is shown."],
    nextActions: [
      "Log your first trade in the journal with its stop loss and the rules you followed.",
      "Come back after a few closed trades to review win rate, drawdown, and repeated mistakes."
    ]
  },

  reviewTrade: (t, f) => ({
    summary:
      t.mode === "learning"
        ? `${t.symbol} review: focus on why the setup was valid, how risk was defined, and what lesson to record.`
        : `${t.symbol} ${t.side} process review, based on the coach's fixed rules.`,
    observations: [
      t.rewardToRisk ? `Planned reward-to-risk is ${f(t.rewardToRisk, 2)}R.` : "Reward-to-risk could not be calculated from the provided levels.",
      t.hasExit ? "The trade includes an exit price, so post-trade review can compare plan versus management." : "The trade is missing an exit price."
    ],
    risks: [
      t.hasStop ? "Stop loss is defined, which supports controlled risk." : "Missing stop loss makes risk difficult to quantify.",
      "Check news, liquidity, and session context before interpreting this review."
    ],
    nextActions: [
      "Record whether the setup matched the written strategy checklist.",
      "Compare actual risk size against account risk rules.",
      "Tag emotional state and mistakes so journal analytics can find patterns.",
      t.mode === "learning" ? "Write one sentence explaining the R multiple in plain language." : "Compare this trade with the strategy playbook."
    ]
  }),

  journalInsights: (m, f) => ({
    summary: `Journal insight generated from ${m.totalTrades} closed trades.`,
    observations: [
      `Win rate: ${f(m.winRate * 100, 1)}%.`,
      `Expectancy: ${f(m.expectancy, 2)} account currency units per closed trade.`,
      `Profit factor: ${Number.isFinite(m.profitFactor) ? f(m.profitFactor, 2) : "unlimited from no losses"}.`
    ],
    risks: [
      m.maxDrawdownR >= DRAWDOWN_REVIEW_R
        ? `Drawdown reached ${f(m.maxDrawdownR, 1)}R (about ${f(m.maxDrawdownR, 0)}% of an account risking 1% per trade); review position sizing and rule violations.`
        : `Drawdown is contained in the sample (${f(m.maxDrawdownR, 1)}R), but more trades are needed for confidence.`,
      "Small sample sizes can produce misleading statistics."
    ],
    nextActions: [
      "Review worst losing setups and mark avoidable mistakes.",
      "Separate performance by strategy and market.",
      "Keep risk per trade consistent before changing the strategy."
    ]
  }),

  weeklyReview: (m, mode, f) => ({
    summary:
      mode === "learning"
        ? "This weekly review explains what to study from your trades without making market predictions."
        : "Weekly coaching review focused on process quality, risk consistency, and repeated behavior.",
    observations: [
      `Closed trades reviewed: ${m.totalTrades}.`,
      `Net P&L: ${f(m.netPnl, 2)}.`,
      `Average R: ${f(m.averageR, 2)}.`
    ],
    risks: [
      m.maxDrawdownR >= DRAWDOWN_REVIEW_R
        ? `Drawdown reached ${f(m.maxDrawdownR, 1)}R and deserves immediate risk-rule review.`
        : "Continue monitoring drawdown before increasing risk.",
      "Do not change strategy rules from a small sample without written review."
    ],
    nextActions: [
      "List the top repeated mistake of the week.",
      "Choose one checklist improvement for next week.",
      mode === "learning" ? "Review glossary terms: expectancy, R multiple, profit factor." : "Compare performance by strategy and session."
    ]
  }),

  strategyReview: (strategyId) => ({
    summary: strategyId
      ? `Strategy ${strategyId} review generated as a checklist improvement workflow.`
      : "General strategy review generated as a playbook improvement workflow.",
    observations: [
      "A strategy should define entry, exit, invalidation, and risk rules before any trade is planned.",
      "Common mistakes should be written directly into the checklist."
    ],
    risks: ["Keep strategy notes framed as review criteria, not certainty language.", "Backtest samples should be reviewed for context and bias."],
    nextActions: [
      "Add one invalidation rule that is easy to verify.",
      "Add one common mistake to avoid.",
      "Review performance by market, session, and setup."
    ]
  }),

  newsSummary: (mode) => ({
    summary: "A summary of the news backdrop, for risk awareness.",
    observations: [
      "News can change volatility and invalidate timing assumptions.",
      "Macro, crypto-specific, and company-specific context should be reviewed separately."
    ],
    risks: ["News context is not directional certainty.", "Treat context classification as background for review, not an action instruction."],
    nextActions: [
      "Link relevant news to planned trades.",
      "Check whether your plan conflicts with high-impact context.",
      mode === "learning" ? "Write what happened and which market may be affected." : "Reduce or skip risk when context conflicts with rules."
    ]
  })
};

const fa: Copy = {
  notEnoughData: {
    summary: "هنوز داده کافی نیست: معامله بسته‌شده‌ای برای مرور وجود ندارد.",
    observations: ["برای آمار به دست‌کم یک معامله بسته‌شده در ژورنال نیاز است."],
    risks: ["مرور صفر معامله فقط اعداد خالی را تکرار می‌کند؛ برای همین چیزی نمایش داده نمی‌شود."],
    nextActions: [
      "اولین معامله‌تان را همراه با حد ضرر و قوانینی که رعایت کردید در ژورنال ثبت کنید.",
      "بعد از چند معامله بسته‌شده برگردید تا نرخ برد، افت سرمایه و اشتباه‌های تکراری را مرور کنید."
    ]
  },

  reviewTrade: (t, f) => {
    const side = t.side === "long" ? "لانگ" : "شورت";
    return {
      summary:
        t.mode === "learning"
          ? `مرور ${t.symbol}: روی این تمرکز کنید که چرا ستاپ معتبر بود، ریسک چطور تعریف شد و چه درسی باید ثبت شود.`
          : `مرور فرایند معامله ${t.symbol} (${side}) بر پایه قواعد ثابت مربی.`,
      observations: [
        t.rewardToRisk
          ? `نسبت پاداش به ریسک برنامه‌ریزی‌شده ${f(t.rewardToRisk, 2)}R است.`
          : "نسبت پاداش به ریسک از روی سطوح واردشده قابل محاسبه نبود.",
        t.hasExit
          ? "این معامله قیمت خروج دارد، پس مرور بعد از معامله می‌تواند پلن را با مدیریت واقعی مقایسه کند."
          : "برای این معامله قیمت خروج ثبت نشده است."
      ],
      risks: [
        t.hasStop ? "حد ضرر تعریف شده است و به کنترل ریسک کمک می‌کند." : "نبود حد ضرر، اندازه‌گیری ریسک را دشوار می‌کند.",
        "پیش از تفسیر این مرور، اخبار، نقدشوندگی و شرایط سشن را بررسی کنید."
      ],
      nextActions: [
        "ثبت کنید که ستاپ با چک‌لیست مکتوب استراتژی همخوان بود یا نه.",
        "اندازه ریسک واقعی را با قوانین ریسک حساب مقایسه کنید.",
        "حالت احساسی و اشتباه‌ها را برچسب بزنید تا تحلیل ژورنال بتواند الگوها را پیدا کند.",
        t.mode === "learning" ? "در یک جمله ساده توضیح دهید ضریب R یعنی چه." : "این معامله را با پلی‌بوک استراتژی مقایسه کنید."
      ]
    };
  },

  journalInsights: (m, f) => ({
    summary: `بینش ژورنال از ${f(m.totalTrades, 0)} معامله بسته‌شده تهیه شد.`,
    observations: [
      `نرخ برد: ${f(m.winRate * 100, 1)}٪.`,
      `امید ریاضی: ${f(m.expectancy, 2)} واحد پول حساب به‌ازای هر معامله بسته‌شده.`,
      `ضریب سود: ${Number.isFinite(m.profitFactor) ? f(m.profitFactor, 2) : "نامحدود، چون ضرری ثبت نشده"}.`
    ],
    risks: [
      m.maxDrawdownR >= DRAWDOWN_REVIEW_R
        ? `افت سرمایه به ${f(m.maxDrawdownR, 1)}R رسید (حدود ${f(m.maxDrawdownR, 0)}٪ از حسابی که در هر معامله ۱٪ ریسک می‌کند)؛ اندازه پوزیشن و نقض قوانین را مرور کنید.`
        : `افت سرمایه در این نمونه محدود است (${f(m.maxDrawdownR, 1)}R)، اما برای اطمینان به معاملات بیشتری نیاز است.`,
      "نمونه‌های کوچک می‌توانند آمار گمراه‌کننده بدهند."
    ],
    nextActions: [
      "بدترین ستاپ‌های ضررده را مرور کنید و اشتباه‌های قابل‌اجتناب را علامت بزنید.",
      "عملکرد را بر اساس استراتژی و بازار جدا کنید.",
      "پیش از تغییر استراتژی، ریسک هر معامله را ثابت نگه دارید."
    ]
  }),

  weeklyReview: (m, mode, f) => ({
    summary:
      mode === "learning"
        ? "این مرور هفتگی توضیح می‌دهد از معامله‌هایتان چه چیزی را باید یاد بگیرید، بدون هیچ پیش‌بینی از بازار."
        : "مرور هفتگی مربی با تمرکز بر کیفیت فرایند، ثبات ریسک و رفتارهای تکراری.",
    observations: [
      `معاملات بسته‌شده‌ی مرورشده: ${f(m.totalTrades, 0)}.`,
      `سود و زیان خالص: ${f(m.netPnl, 2)}.`,
      `میانگین R: ${f(m.averageR, 2)}.`
    ],
    risks: [
      m.maxDrawdownR >= DRAWDOWN_REVIEW_R
        ? `افت سرمایه به ${f(m.maxDrawdownR, 1)}R رسید و مرور فوری قوانین ریسک لازم است.`
        : "پیش از افزایش ریسک، افت سرمایه را زیر نظر داشته باشید.",
      "بدون مرور مکتوب، قوانین استراتژی را بر اساس یک نمونه کوچک تغییر ندهید."
    ],
    nextActions: [
      "مهم‌ترین اشتباه تکراری این هفته را فهرست کنید.",
      "یک بهبود در چک‌لیست برای هفته آینده انتخاب کنید.",
      mode === "learning"
        ? "اصطلاح‌های امید ریاضی، ضریب R و ضریب سود را در واژه‌نامه مرور کنید."
        : "عملکرد را بر اساس استراتژی و سشن مقایسه کنید."
    ]
  }),

  strategyReview: (strategyId) => ({
    summary: strategyId
      ? `مرور استراتژی ${strategyId} به‌صورت یک گردش‌کار بهبود چک‌لیست تهیه شد.`
      : "مرور کلی استراتژی به‌صورت یک گردش‌کار بهبود پلی‌بوک تهیه شد.",
    observations: [
      "هر استراتژی باید پیش از برنامه‌ریزی هر معامله، قوانین ورود، خروج، ابطال و ریسک را مشخص کند.",
      "اشتباه‌های رایج را مستقیم در چک‌لیست بنویسید."
    ],
    risks: ["یادداشت‌های استراتژی را به‌شکل معیار مرور بنویسید، نه با زبان قطعیت.", "نمونه‌های بک‌تست را با توجه به زمینه و سوگیری بررسی کنید."],
    nextActions: [
      "یک قانون ابطال اضافه کنید که بررسی‌اش آسان باشد.",
      "یک اشتباه رایج را برای پرهیز از آن اضافه کنید.",
      "عملکرد را بر اساس بازار، سشن و ستاپ مرور کنید."
    ]
  }),

  newsSummary: (mode) => ({
    summary: "خلاصه‌ای از شرایط خبری برای آگاهی از ریسک.",
    observations: [
      "اخبار می‌توانند نوسان را تغییر دهند و فرض‌های زمان‌بندی را باطل کنند.",
      "شرایط کلان، خبرهای کریپتو و خبرهای شرکت‌ها را جداگانه مرور کنید."
    ],
    risks: ["شرایط خبری به معنای قطعیت جهت بازار نیست.", "دسته‌بندی خبرها را پس‌زمینه‌ای برای مرور بدانید، نه دستور عمل."],
    nextActions: [
      "خبرهای مرتبط را به معامله‌های برنامه‌ریزی‌شده وصل کنید.",
      "بررسی کنید پلن‌تان با خبرهای پراثر تضاد دارد یا نه.",
      mode === "learning"
        ? "بنویسید چه اتفاقی افتاد و کدام بازار ممکن است اثر بپذیرد."
        : "وقتی خبرها با قوانین‌تان تضاد دارند، ریسک را کم کنید یا از معامله صرف‌نظر کنید."
    ]
  })
};

const copy: Record<Locale, Copy> = { en, fa };

function withEnvelope(mode: Mode, locale: Locale, body: Body): AiResponse {
  return { disclaimer: canonicalAiDisclaimer(locale), mode, ...body };
}

const formatter = (locale: Locale): Fmt => (value, fractionDigits) => formatGeneratedNumber(value, fractionDigits, locale);

/** Shown instead of zeroed statistics while there is no closed trade to look at. */
export function notEnoughDataYet(mode: Mode, locale: Locale = "en"): AiResponse {
  return withEnvelope(mode, locale, copy[locale].notEnoughData);
}

export function localTradeReview(facts: TradeFacts, locale: Locale = "en"): AiResponse {
  return withEnvelope(facts.mode, locale, copy[locale].reviewTrade(facts, formatter(locale)));
}

export function localJournalInsights(metrics: CoachMetrics, locale: Locale = "en"): AiResponse {
  return withEnvelope("professional_coach", locale, copy[locale].journalInsights(metrics, formatter(locale)));
}

export function localWeeklyReview(metrics: CoachMetrics, mode: Mode, locale: Locale = "en"): AiResponse {
  return withEnvelope(mode, locale, copy[locale].weeklyReview(metrics, mode, formatter(locale)));
}

export function localStrategyReview(strategyId: string | undefined, mode: Mode, locale: Locale = "en"): AiResponse {
  return withEnvelope(mode, locale, copy[locale].strategyReview(strategyId));
}

export function localNewsSummary(mode: Mode, locale: Locale = "en"): AiResponse {
  return withEnvelope(mode, locale, copy[locale].newsSummary(mode));
}
