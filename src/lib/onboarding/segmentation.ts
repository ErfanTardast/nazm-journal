import { localizeDigits } from "@/lib/services/locale";

/**
 * Phase Zeta — minimal onboarding segmentation. Pure: maps a new user's self-description
 * (experience, market, top discipline issue, language) to a starting plan — focus areas, a few
 * recommended features, a starting checklist, and a conservative default risk %. No DB, no network,
 * no advice/signals; just a deterministic, discipline-first routing of the first session.
 * The plan and the sprint are written in the language the user chose (English or Persian).
 */
export type Experience = "beginner" | "intermediate" | "advanced";
export type Market = "crypto" | "forex" | "stocks";
export type DisciplineIssue = "overtrading" | "revenge" | "moving_stops" | "fomo" | "no_plan" | "oversizing";
export type Language = "en" | "fa";

export type OnboardingInput = {
  experience: Experience;
  market: Market;
  disciplineIssue: DisciplineIssue;
  language: Language;
};

/** Raw (untrusted) form/query values; every field is coerced via the resolve* helpers. */
export type OnboardingRawInput = {
  experience?: unknown;
  market?: unknown;
  disciplineIssue?: unknown;
  language?: unknown;
};

export type OnboardingPlan = {
  segment: string; // e.g. "beginner-crypto-overtrading"
  experience: Experience;
  market: Market;
  language: Language;
  defaultRiskPercent: number;
  focusAreas: string[];
  recommendedFeatures: string[];
  startingChecklist: string[];
};

export type StarterPlaybook = {
  name: string;
  description: string;
  entryRules: string[];
  exitRules: string[];
  invalidationRules: string[];
  riskRules: string[];
  allowedMarkets: Market[];
  timeframes: string[];
  allowedSessions: string[];
  checklist: string[];
  commonMistakes: string[];
  idealMarketConditions: string[];
  tags: string[];
};

export type DisciplineSprintDay = {
  day: number;
  date: string;
  targetScore: number;
  focus: string;
  reviewPrompt: string;
};

export type DisciplineSprint = {
  title: string;
  startDate: string;
  endDate: string;
  targetMistake: string;
  sessionRule: string;
  riskDefaults: {
    riskPerTradePct: number;
    maxDailyLossPct: number;
    maxWeeklyLossPct: number;
  };
  starterPlaybook: StarterPlaybook;
  days: DisciplineSprintDay[];
};

const EXPERIENCES: readonly Experience[] = ["beginner", "intermediate", "advanced"];
const MARKETS: readonly Market[] = ["crypto", "forex", "stocks"];
const ISSUES: readonly DisciplineIssue[] = ["overtrading", "revenge", "moving_stops", "fomo", "no_plan", "oversizing"];

/** Everything the plan and the sprint say in words, per language. Keys, numbers and identifiers live in the code below. */
type OnboardingCopy = {
  issueFocus: Record<DisciplineIssue, string[]>;
  targetMistake: Record<DisciplineIssue, string>;
  sessionRule: Record<DisciplineIssue, string>;
  checklist: { startSession: string; createPlaybook: string; maxDailyLoss: string; learningMode: string; weeklyAdherence: string };
  marketLabel: Record<Market, string>;
  playbook: {
    name(market: string): string;
    description: string;
    entryRules: string[];
    exitRules: string[];
    invalidationRules: string[];
    riskRules(riskPercent: string): string[];
    allowedSessions: string[];
    checklist: string[];
    idealMarketConditions: string[];
  };
  sprintTitle: string;
  dayFocus: string[];
  reviewPrompt(targetMistake: string): string;
};

const en: OnboardingCopy = {
  issueFocus: {
    overtrading: ["Set a per-session trade cap", "Log every trade against a plan"],
    revenge: ["Set a max daily loss and stop for the day", "Pause and journal after a loss"],
    moving_stops: ["Pre-commit your stop before entry", "Mark each trade rule-followed or broken"],
    fomo: ["Require a written plan before entry", "Wait for your setup, not the move"],
    no_plan: ["Write a one-line plan before each trade", "Build one repeatable playbook first"],
    oversizing: ["Size every trade from a fixed risk %", "Check the risk calculator before entry"]
  },
  targetMistake: {
    overtrading: "Taking trades after the session cap",
    revenge: "Trading to recover a loss",
    moving_stops: "Moving stop after entry",
    fomo: "Entering because price moved without a written plan",
    no_plan: "Trading without a written plan",
    oversizing: "Increasing size beyond the risk default"
  },
  sessionRule: {
    overtrading: "Stop the session after two recorded trades or one broken-rule trade.",
    revenge: "After a losing trade, pause and complete a journal note before any new record.",
    moving_stops: "Write invalidation before entry and mark the rule broken if the stop changes later.",
    fomo: "No written plan means no trade record can be marked planned.",
    no_plan: "Create the plan before the session and only journal against that plan.",
    oversizing: "Use the fixed risk default for every planned trade in the sprint."
  },
  checklist: {
    startSession: "Start a trading session before your first trade",
    createPlaybook: "Create one playbook (strategy) you will follow",
    maxDailyLoss: "Set your max daily loss",
    learningMode: "Trade in Learning Mode first",
    weeklyAdherence: "Review last week's adherence"
  },
  marketLabel: { crypto: "Crypto", forex: "Forex", stocks: "Stocks" },
  playbook: {
    name: (market) => `${market} discipline starter`,
    description: "Starter playbook for reviewing one repeatable setup, risk rule, and mistake pattern.",
    entryRules: [
      "A written scenario exists before the session starts.",
      "The setup matches the selected market and timeframe.",
      "The session rule is visible before any journal record is created."
    ],
    exitRules: [
      "Record the planned exit reason before reviewing outcome.",
      "Close the review loop with one lesson, not a market prediction."
    ],
    invalidationRules: [
      "If the written scenario is invalid, the setup is skipped and journaled as a lesson.",
      "If the checklist is incomplete, the record is marked unplanned."
    ],
    riskRules: (riskPercent) => [
      `Default risk stays at ${riskPercent}% per trade during the sprint.`,
      "Do not increase size after a loss or a broken-rule record."
    ],
    allowedSessions: ["User-defined focused session"],
    checklist: ["Scenario written", "Risk checked", "Invalidation written", "Target mistake reviewed", "Post-session lesson captured"],
    idealMarketConditions: ["Clear session plan", "No unresolved review item", "Risk defaults unchanged"]
  },
  sprintTitle: "7-day discipline sprint",
  dayFocus: [
    "Set the baseline and start one focused session.",
    "Use the starter playbook before any journal record.",
    "Review whether the target mistake appeared.",
    "Keep risk defaults unchanged and finish the daily review.",
    "Compare plan quality against journal completeness.",
    "Rewrite one checklist item from the week evidence.",
    "Close the sprint with one process lesson and next guardrail."
  ],
  reviewPrompt: (targetMistake) => `Did I avoid "${targetMistake}" and follow the written session rule?`
};

const fa: OnboardingCopy = {
  issueFocus: {
    overtrading: ["برای هر جلسه سقف تعداد معامله تعیین کنید", "هر معامله را بر اساس یک پلن ثبت کنید"],
    revenge: ["حداکثر ضرر روزانه را تعیین کنید و برای آن روز متوقف شوید", "بعد از هر ضرر مکث کنید و در ژورنال بنویسید"],
    moving_stops: ["حد ضرر را پیش از ورود ثابت کنید", "هر معامله را «قانون رعایت شد» یا «قانون نقض شد» علامت بزنید"],
    fomo: ["بدون پلن مکتوب وارد نشوید", "منتظر ستاپ خودتان بمانید، نه حرکت بازار"],
    no_plan: ["پیش از هر معامله یک پلن یک‌خطی بنویسید", "اول یک پلی‌بوک تکرارپذیر بسازید"],
    oversizing: ["اندازه هر معامله را از یک درصد ریسک ثابت محاسبه کنید", "پیش از ورود، ماشین‌حساب ریسک را بررسی کنید"]
  },
  targetMistake: {
    overtrading: "معامله بعد از پر شدن سقف معاملات جلسه",
    revenge: "معامله برای جبران ضرر",
    moving_stops: "جابه‌جا کردن حد ضرر بعد از ورود",
    fomo: "ورود فقط چون قیمت حرکت کرد، بدون پلن مکتوب",
    no_plan: "معامله بدون پلن مکتوب",
    oversizing: "بیشتر کردن حجم از پیش‌فرض ریسک"
  },
  sessionRule: {
    overtrading: "جلسه را بعد از دو معامله ثبت‌شده یا یک معامله با نقض قانون متوقف کنید.",
    revenge: "بعد از یک معامله ضررده مکث کنید و پیش از هر رکورد جدید یک یادداشت ژورنال کامل کنید.",
    moving_stops: "ابطال را پیش از ورود بنویسید و اگر حد ضرر بعداً تغییر کرد، قانون را نقض‌شده علامت بزنید.",
    fomo: "بدون پلن مکتوب، هیچ رکورد معامله‌ای را نمی‌شود «برنامه‌ریزی‌شده» علامت زد.",
    no_plan: "پلن را پیش از جلسه بسازید و فقط بر اساس همان پلن در ژورنال ثبت کنید.",
    oversizing: "در طول اسپرینت برای هر معامله برنامه‌ریزی‌شده از پیش‌فرض ریسک ثابت استفاده کنید."
  },
  checklist: {
    startSession: "پیش از اولین معامله یک جلسه معاملاتی شروع کنید",
    createPlaybook: "یک پلی‌بوک (استراتژی) بسازید که از آن پیروی کنید",
    maxDailyLoss: "حداکثر ضرر روزانه‌تان را تعیین کنید",
    learningMode: "ابتدا در حالت یادگیری معامله کنید",
    weeklyAdherence: "پایبندی هفته گذشته را مرور کنید"
  },
  marketLabel: { crypto: "کریپتو", forex: "فارکس", stocks: "سهام" },
  playbook: {
    name: (market) => `پلی‌بوک شروع انضباط ${market}`,
    description: "پلی‌بوک شروع برای مرور یک ستاپ تکرارپذیر، یک قانون ریسک و یک الگوی اشتباه.",
    entryRules: [
      "پیش از شروع جلسه یک سناریوی مکتوب وجود دارد.",
      "ستاپ با بازار و تایم‌فریم انتخاب‌شده همخوان است.",
      "قانون جلسه پیش از ساخت هر رکورد ژورنال دیده می‌شود."
    ],
    exitRules: [
      "دلیل خروج برنامه‌ریزی‌شده را پیش از مرور نتیجه ثبت کنید.",
      "حلقه مرور را با یک درس ببندید، نه با پیش‌بینی بازار."
    ],
    invalidationRules: [
      "اگر سناریوی مکتوب باطل شد، ستاپ رد می‌شود و به‌عنوان یک درس در ژورنال ثبت می‌شود.",
      "اگر چک‌لیست ناقص باشد، رکورد «بدون پلن» علامت می‌خورد."
    ],
    riskRules: (riskPercent) => [
      `ریسک پیش‌فرض در طول اسپرینت ${riskPercent}٪ برای هر معامله می‌ماند.`,
      "بعد از ضرر یا رکورد با نقض قانون، حجم را بیشتر نکنید."
    ],
    allowedSessions: ["جلسه متمرکزی که خودتان تعریف می‌کنید"],
    checklist: ["سناریو نوشته شد", "ریسک بررسی شد", "ابطال نوشته شد", "خطای هدف مرور شد", "درس بعد از جلسه ثبت شد"],
    idealMarketConditions: ["پلن جلسه روشن است", "هیچ مورد مرور حل‌نشده‌ای نیست", "پیش‌فرض‌های ریسک تغییر نکرده‌اند"]
  },
  sprintTitle: "اسپرینت انضباط هفت‌روزه",
  dayFocus: [
    "خط پایه را تعیین کنید و یک جلسه متمرکز شروع کنید.",
    "پیش از هر رکورد ژورنال از پلی‌بوک شروع استفاده کنید.",
    "مرور کنید که خطای هدف ظاهر شد یا نه.",
    "پیش‌فرض‌های ریسک را تغییر ندهید و مرور روزانه را کامل کنید.",
    "کیفیت پلن را با کامل بودن ژورنال مقایسه کنید.",
    "بر اساس شواهد این هفته یک مورد چک‌لیست را بازنویسی کنید.",
    "اسپرینت را با یک درس فرایندی و قانون محافظ جلسه بعد ببندید."
  ],
  reviewPrompt: (targetMistake) => `آیا از «${targetMistake}» پرهیز کردم و از قانون مکتوب جلسه پیروی کردم؟`
};

const copy: Record<Language, OnboardingCopy> = { en, fa };

const RISK_BY_EXPERIENCE: Record<Experience, number> = { beginner: 0.5, intermediate: 1, advanced: 1 };

export function resolveExperience(value: unknown): Experience {
  return EXPERIENCES.includes(value as Experience) ? (value as Experience) : "beginner";
}
export function resolveMarket(value: unknown): Market {
  return MARKETS.includes(value as Market) ? (value as Market) : "crypto";
}
export function resolveDisciplineIssue(value: unknown): DisciplineIssue {
  return ISSUES.includes(value as DisciplineIssue) ? (value as DisciplineIssue) : "no_plan";
}
export function resolveLanguage(value: unknown): Language {
  return value === "fa" ? "fa" : "en";
}

export function buildOnboardingPlan(raw: OnboardingRawInput = {}): OnboardingPlan {
  const experience = resolveExperience(raw.experience);
  const market = resolveMarket(raw.market);
  const disciplineIssue = resolveDisciplineIssue(raw.disciplineIssue);
  const language = resolveLanguage(raw.language);
  const c = copy[language];

  const recommendedFeatures = ["trading-session", "journal", "risk-calculator"];
  if (experience === "beginner") recommendedFeatures.push("learning");
  else recommendedFeatures.push("performance");

  const startingChecklist = [
    c.checklist.startSession,
    c.checklist.createPlaybook,
    c.checklist.maxDailyLoss,
    experience === "beginner" ? c.checklist.learningMode : c.checklist.weeklyAdherence
  ];

  return {
    segment: `${experience}-${market}-${disciplineIssue}`,
    experience,
    market,
    language,
    defaultRiskPercent: RISK_BY_EXPERIENCE[experience],
    focusAreas: c.issueFocus[disciplineIssue],
    recommendedFeatures,
    startingChecklist
  };
}

export function buildDisciplineSprint(plan: OnboardingPlan, startDate = "2026-06-01"): DisciplineSprint {
  const issue = resolveDisciplineIssue(plan.segment.split("-").slice(2).join("-"));
  const c = copy[plan.language];
  const targetMistake = c.targetMistake[issue];
  const sessionRule = c.sessionRule[issue];
  const riskDefaults = {
    riskPerTradePct: plan.defaultRiskPercent,
    maxDailyLossPct: 3,
    maxWeeklyLossPct: 6
  };

  const starterPlaybook: StarterPlaybook = {
    name: c.playbook.name(c.marketLabel[plan.market]),
    description: c.playbook.description,
    entryRules: c.playbook.entryRules,
    exitRules: c.playbook.exitRules,
    invalidationRules: c.playbook.invalidationRules,
    riskRules: c.playbook.riskRules(localizeDigits(String(plan.defaultRiskPercent), plan.language)),
    allowedMarkets: [plan.market],
    timeframes: plan.experience === "beginner" ? ["1h", "4h"] : ["15m", "1h", "4h"],
    allowedSessions: c.playbook.allowedSessions,
    checklist: c.playbook.checklist,
    commonMistakes: [targetMistake],
    idealMarketConditions: c.playbook.idealMarketConditions,
    tags: ["onboarding-sprint", plan.experience, plan.market, issue]
  };

  return {
    title: c.sprintTitle,
    startDate,
    endDate: addDaysISO(startDate, 6),
    targetMistake,
    sessionRule,
    riskDefaults,
    starterPlaybook,
    days: c.dayFocus.map((focus, index) => ({
      day: index + 1,
      date: addDaysISO(startDate, index),
      targetScore: Math.min(100, 65 + index * 5),
      focus,
      reviewPrompt: c.reviewPrompt(targetMistake)
    }))
  };
}

function addDaysISO(start: string, days: number): string {
  const date = new Date(`${start}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
