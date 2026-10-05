import type { Locale } from "./locales";

export function formatMoney(value: number, locale: Locale = "en", currency = "USD") {
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(value);
}

export function formatPercent(value: number, locale: Locale = "en") {
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", {
    style: "percent",
    maximumFractionDigits: 2
  }).format(value);
}

export function formatDate(value: string | Date, locale: Locale = "en") {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

/*
 * Numbers on a page: every number goes through one of these, never toFixed, String() or a bare template literal,
 * so a Persian page has Persian digits and a negative number keeps its minus on the left (Intl fa-IR puts a
 * left-to-right mark and U+2212 in front of it). A value that rounds to zero is written without a sign.
 */
const intlLocale = (locale: Locale) => (locale === "fa" ? "fa-IR" : "en-US");

/** Up to two decimals by default; `min` pads with zeros, `max` rounds. */
export function formatNumber(value: number, locale: Locale, digits: { min?: number; max?: number } = {}) {
  const min = digits.min ?? 0;
  const max = Math.max(digits.max ?? 2, min);
  return new Intl.NumberFormat(intlLocale(locale), { minimumFractionDigits: min, maximumFractionDigits: max }).format(
    Math.abs(value) < 0.5 / 10 ** max ? 0 : value
  );
}

/** A whole number with grouping. */
export function formatCount(value: number, locale: Locale) {
  return formatNumber(value, locale, { max: 0 });
}

const LRI = "\u2066";
const PDI = "\u2069";

/** "1.25R" with a fixed number of decimals; in Persian it is isolated left to right, so it sits right inside RTL text. */
export function formatR(value: number, locale: Locale, digits = 2) {
  const text = `${formatNumber(value, locale, { min: digits, max: digits })}R`;
  return locale === "fa" ? `${LRI}${text}${PDI}` : text;
}

/** Money with its sign: "+$120.50", "-$120.50", and "$0.00" for zero. */
export function formatSignedMoney(value: number, locale: Locale) {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
    signDisplay: "exceptZero"
  }).format(value);
}

/** A day key ("YYYY-MM-DD") as month and day: "Oct 3", or "۱۱ مهر" in the Persian calendar. Anything else comes back as it was. */
export function formatShortDay(day: string, locale: Locale) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const at = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
  if (!at || at.toISOString().slice(0, 10) !== day) return day;
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en-US", { day: "numeric", month: locale === "fa" ? "long" : "short", timeZone: "UTC" }).format(at);
}
