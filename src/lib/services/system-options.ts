import { getRedisUrl } from "@/lib/env";

export type SystemOption = {
  value: string;
  label: string;
  description?: string;
};

export function getSystemOptions() {
  return {
    product: {
      name: "Nazm",
      mode: "second_brain",
      supportedMarkets: [
        { value: "forex", label: "Forex", description: "Currency pairs and macro-context review." },
        { value: "crypto", label: "Crypto", description: "Crypto spot journal, risk, and context review." },
        { value: "stocks", label: "Global Stocks", description: "Equity journal and performance context." }
      ] satisfies SystemOption[],
      coreWorkflows: [
        "Daily review",
        "Trade planning",
        "Trade journaling",
        "Risk check",
        "Performance review",
        "Strategy playbook review",
        "News/context review",
        "Learning mode"
      ],
      safetyGuardrails: [
        "Educational analytics only",
        "No market certainty language",
        "No financial advice promises",
        "No live market connectivity",
        "No automation of trading decisions"
      ]
    },
    userDefaults: {
      locales: [
        { value: "en", label: "English", description: "LTR interface." },
        { value: "fa", label: "فارسی", description: "RTL interface." }
      ] satisfies SystemOption[],
      themes: [
        { value: "dark", label: "Dark", description: "Recommended focused workspace." },
        { value: "light", label: "Light", description: "Reserved for bright environments." },
        { value: "system", label: "System", description: "Follow operating-system preference." }
      ] satisfies SystemOption[],
      timezones: [
        "Asia/Tehran",
        "UTC",
        "Europe/London",
        "America/New_York",
        "Asia/Dubai",
        "Asia/Singapore",
        "Asia/Tokyo"
      ],
      riskPresets: [
        { label: "Conservative", riskPerTradePct: 0.5, maxDailyLossPct: 1.5, maxWeeklyLossPct: 4 },
        { label: "Balanced", riskPerTradePct: 1, maxDailyLossPct: 3, maxWeeklyLossPct: 6 },
        { label: "Strict Evaluation", riskPerTradePct: 0.25, maxDailyLossPct: 1, maxWeeklyLossPct: 3 }
      ]
    },
    ai: {
      provider: process.env.AI_PROVIDER ?? "local",
      defaultMode: "professional_coach",
      workflows: [
        { value: "professional_coach", label: "Professional Coach", description: "Process-quality review for experienced traders." },
        { value: "learning", label: "Learning Assistant", description: "Beginner-friendly explanation and study prompts." },
        { value: "journal_reviewer", label: "Journal Reviewer", description: "Find recurring behavior in trade notes." },
        { value: "strategy_reviewer", label: "Strategy Reviewer", description: "Improve playbook clarity and checklist discipline." },
        { value: "risk_discipline", label: "Risk Discipline", description: "Review risk consistency against saved defaults." },
        { value: "news_context", label: "News Context", description: "Summarize context as caution notes and review questions." },
        { value: "weekly_review", label: "Weekly Review", description: "Turn the week into process lessons." }
      ] satisfies SystemOption[]
    },
    infrastructure: {
      database: process.env.DATABASE_URL ? "configured" : "default-local",
      redis: getRedisUrl() ? "configured" : "memory-fallback",
      emailProvider: process.env.EMAIL_PROVIDER ?? "local",
      marketDataProvider: process.env.MARKET_DATA_PROVIDER ?? "local",
      appUrl: process.env.APP_URL ?? "http://localhost:3000"
    }
  };
}
