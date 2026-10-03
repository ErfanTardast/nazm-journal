import type { Locale } from "@/lib/i18n/locales";
import { localizeDigits } from "@/lib/services/locale";

/** The limit fields as the API sends them: numbers, Prisma decimals as text ("0.5000"), or nothing. */
export type LimitValue = number | string | null | undefined;

/** A limit as a number, or null when it is not set (or not a number). */
export function limitNumber(value: LimitValue): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** A number in the digits of the language without trailing zeros: 0.5 is "0.5" in English and "۰٫۵" in Persian. */
export function formatLimitNumber(value: number, locale: Locale): string {
  return localizeDigits(String(Number(value.toFixed(4))), locale);
}

/** A percent: "0.5%" in English, "۰٫۵٪" in Persian. */
export function formatLimitPercent(value: number, locale: Locale): string {
  return `${formatLimitNumber(value, locale)}${locale === "fa" ? "٪" : "%"}`;
}

export type StrategyLimits = { riskPerTradePct?: LimitValue; maxDailyLossPct?: LimitValue; maxOpenPositions?: LimitValue };
export type LimitLabels = { riskPerTradePct: string; maxDailyLossPct: string; maxOpenPositions: string };

/** The limits a strategy sets, one line each ("Risk per trade 0.5%"); a limit that is not set is left out. */
export function limitSummaryLines(limits: StrategyLimits, labels: LimitLabels, locale: Locale): string[] {
  const risk = limitNumber(limits.riskPerTradePct);
  const daily = limitNumber(limits.maxDailyLossPct);
  const open = limitNumber(limits.maxOpenPositions);
  return [
    risk !== null ? `${labels.riskPerTradePct} ${formatLimitPercent(risk, locale)}` : null,
    daily !== null ? `${labels.maxDailyLossPct} ${formatLimitPercent(daily, locale)}` : null,
    open !== null ? `${labels.maxOpenPositions} ${formatLimitNumber(open, locale)}` : null
  ].filter((line): line is string => line !== null);
}
