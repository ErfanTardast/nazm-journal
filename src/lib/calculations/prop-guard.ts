import type { Locale } from "@/lib/i18n/locales";
import { formatGeneratedNumber } from "@/lib/services/locale";

export type PropGuardInput = {
  maxDailyLossPct: number;
  riskPerTradePct: number;
  todayLossPct: number;
  todayTradeCount: number;
  maxDailyTrades: number | null;
  recentResults: boolean[];
  todayUnplannedCount: number;
};

export type PropGuardAlertKey =
  | "daily_loss_limit"
  | "daily_loss_warning"
  | "overtrading"
  | "revenge_pattern"
  | "unplanned_trades";

export type PropGuardAlert = {
  key: PropGuardAlertKey;
  severity: "danger" | "warning";
  message: string;
};

export type PropGuardResult = {
  alerts: PropGuardAlert[];
  isBlocked: boolean;
  todayLossPct: number;
  maxDailyLossPct: number;
};

/** The alert sentences, per language. Numbers arrive written in the digits of the language. */
const alertCopy = {
  en: {
    limit: (loss: string, max: string) => `Daily loss limit reached: ${loss}% of ${max}% max.`,
    warning: (loss: string, max: string) => `Approaching daily loss limit: ${loss}% of ${max}% max.`,
    overtrading: (count: string, max: string) => `${count} trades today (session limit: ${max}).`,
    revenge: "Two consecutive losses. Review the plan before the next entry.",
    unplanned: (count: string, plural: boolean) => `${count} trade${plural ? "s" : ""} today without a written plan or playbook.`
  },
  fa: {
    limit: (loss: string, max: string) => `به سقف ضرر روزانه رسیده‌اید: ${loss}٪ از حداکثر ${max}٪.`,
    warning: (loss: string, max: string) => `به سقف ضرر روزانه نزدیک می‌شوید: ${loss}٪ از حداکثر ${max}٪.`,
    overtrading: (count: string, max: string) => `امروز ${count} معامله ثبت شده است (سقف جلسه: ${max}).`,
    revenge: "دو ضرر پیاپی. پیش از ورود بعدی پلن را مرور کنید.",
    unplanned: (count: string, _plural: boolean) => `${count} معامله امروز بدون پلن مکتوب یا پلی‌بوک ثبت شده است.`
  }
} as const;

export function checkPropGuard(input: PropGuardInput, locale: Locale = "en"): PropGuardResult {
  const alerts: PropGuardAlert[] = [];
  const c = alertCopy[locale];
  const num = (value: number, fractionDigits: number) => formatGeneratedNumber(value, fractionDigits, locale);

  if (input.maxDailyLossPct > 0) {
    if (input.todayLossPct >= input.maxDailyLossPct) {
      alerts.push({
        key: "daily_loss_limit",
        severity: "danger",
        message: c.limit(num(input.todayLossPct, 1), num(input.maxDailyLossPct, 1))
      });
    } else if (input.todayLossPct >= input.maxDailyLossPct * 0.7) {
      alerts.push({
        key: "daily_loss_warning",
        severity: "warning",
        message: c.warning(num(input.todayLossPct, 1), num(input.maxDailyLossPct, 1))
      });
    }
  }

  if (input.maxDailyTrades !== null && input.maxDailyTrades > 0 && input.todayTradeCount >= input.maxDailyTrades) {
    alerts.push({
      key: "overtrading",
      severity: "warning",
      message: c.overtrading(num(input.todayTradeCount, 0), num(input.maxDailyTrades, 0))
    });
  }

  if (input.recentResults.length >= 2) {
    const lastTwo = input.recentResults.slice(-2);
    if (lastTwo.every((r) => !r)) {
      alerts.push({
        key: "revenge_pattern",
        severity: "warning",
        message: c.revenge
      });
    }
  }

  if (input.todayUnplannedCount > 0) {
    alerts.push({
      key: "unplanned_trades",
      severity: "warning",
      message: c.unplanned(num(input.todayUnplannedCount, 0), input.todayUnplannedCount > 1)
    });
  }

  return {
    alerts,
    isBlocked: alerts.some((a) => a.severity === "danger"),
    todayLossPct: input.todayLossPct,
    maxDailyLossPct: input.maxDailyLossPct
  };
}
