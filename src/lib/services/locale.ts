import { entryLocale, isLocale, type Locale } from "@/lib/i18n/locales";

/**
 * The language of server-generated text (coach answers, generated reviews, the onboarding plan, alerts, the mentor report).
 * A screen sends the language it is showing; without a usable one the language saved in the user's settings applies, and
 * without that the Persian-first default.
 */
export function resolveGeneratedLocale(requested: unknown, saved: unknown): Locale {
  if (isLocale(requested)) return requested;
  if (isLocale(saved)) return saved;
  return entryLocale;
}

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const LEFT_TO_RIGHT_MARK = "\u200E";

/**
 * A number as `toFixed` writes it, in the digits of the language: Persian digits and the "٫" decimal mark for fa. A
 * negative Persian number gets a left-to-right mark in front so its minus sign stays on its left inside right-to-left text.
 */
export function formatGeneratedNumber(value: number, fractionDigits: number, locale: Locale): string {
  const text = localizeDigits(value.toFixed(fractionDigits), locale);
  return locale === "fa" && value < 0 ? `${LEFT_TO_RIGHT_MARK}${text}` : text;
}

/**
 * A calendar day written as YYYY-MM-DD, for text in the language of the user. English keeps the ISO day. Persian gets the
 * date the way the reviews screen shows dates: the Persian calendar with Persian digits ("۱۸ خرداد ۱۴۰۵"), so a title
 * never mixes ASCII digits and hyphens into right-to-left text, where they would display in the wrong order.
 */
export function formatGeneratedDate(isoDay: string, locale: Locale): string {
  if (locale !== "fa") return isoDay;
  const date = new Date(`${isoDay}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return localizeDigits(isoDay, locale);
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

/** The digits of a number (or text holding numbers) written elsewhere, in the digits of the language; fa only. */
export function localizeDigits(text: string, locale: Locale): string {
  if (locale !== "fa") return text;
  return text.replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)]).replace(/(?<=[۰-۹])\.(?=[۰-۹])/g, "٫");
}
