import type { PlanRiskViolation } from "@/lib/calculations/plan-risk-check";
import type { Locale } from "@/lib/i18n/locales";
import { formatLimitNumber, formatLimitPercent } from "./limit-format";

/**
 * The words for a plan-risk violation. `checkPlanRisk` only says which limit was passed and by what numbers; this turns
 * it into a sentence in the page language that states both numbers and where the limit comes from. It describes, it never
 * tells the trader what to do with a position.
 */
const copy = {
  en: {
    strategyLimit: (actual: string, limit: string, name: string) => `This plan's risk is ${actual}; the limit of strategy "${name}" is ${limit}.`,
    strategyDaily: (actual: string, limit: string, name: string) => `This plan's risk is ${actual}; the daily loss limit of strategy "${name}" is ${limit}.`,
    accountLimit: (actual: string, limit: string) => `This plan's risk is ${actual}; the risk per trade limit in your settings is ${limit}.`,
    accountDaily: (actual: string, limit: string) => `This plan's risk is ${actual}; the daily loss limit in your settings is ${limit}.`,
    strategyOpen: (actual: string, limit: string, name: string) => `With this plan you would have ${actual} planned or active plans; the open positions limit of strategy "${name}" is ${limit}.`,
    accountOpen: (actual: string, limit: string) => `With this plan you would have ${actual} planned or active plans; the open positions limit in your settings is ${limit}.`
  },
  fa: {
    strategyLimit: (actual: string, limit: string, name: string) => `ریسک این پلن ${actual} است؛ سقف استراتژی «${name}» ${limit} است.`,
    strategyDaily: (actual: string, limit: string, name: string) => `ریسک این پلن ${actual} است؛ سقف ضرر روزانه در استراتژی «${name}» ${limit} است.`,
    accountLimit: (actual: string, limit: string) => `ریسک این پلن ${actual} است؛ سقف ریسک هر معامله در تنظیمات شما ${limit} است.`,
    accountDaily: (actual: string, limit: string) => `ریسک این پلن ${actual} است؛ سقف ضرر روزانه در تنظیمات شما ${limit} است.`,
    strategyOpen: (actual: string, limit: string, name: string) => `با این پلن، ${actual} پلن برنامه‌ریزی‌شده یا فعال خواهید داشت؛ سقف پوزیشن‌های باز در استراتژی «${name}» ${limit} است.`,
    accountOpen: (actual: string, limit: string) => `با این پلن، ${actual} پلن برنامه‌ریزی‌شده یا فعال خواهید داشت؛ سقف پوزیشن‌های باز در تنظیمات شما ${limit} است.`
  }
} as const;

/** `strategyName` is the chosen strategy's name; it is only used when the limit comes from the strategy. */
export function describeViolation(violation: PlanRiskViolation, strategyName: string | null, locale: Locale): string {
  const c = copy[locale];
  const fromStrategy = violation.source === "strategy" && Boolean(strategyName);
  const name = strategyName ?? "";

  if (violation.code === "open_positions") {
    const actual = formatLimitNumber(violation.actual, locale);
    const limit = formatLimitNumber(violation.limit, locale);
    return fromStrategy ? c.strategyOpen(actual, limit, name) : c.accountOpen(actual, limit);
  }

  const actual = formatLimitPercent(violation.actual, locale);
  const limit = formatLimitPercent(violation.limit, locale);
  if (violation.code === "daily_loss") return fromStrategy ? c.strategyDaily(actual, limit, name) : c.accountDaily(actual, limit);
  return fromStrategy ? c.strategyLimit(actual, limit, name) : c.accountLimit(actual, limit);
}
