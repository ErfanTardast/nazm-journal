export const locales = ["en", "fa"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const localeConfig: Record<Locale, { label: string; dir: "ltr" | "rtl"; currency: string; timezone: string }> = {
  en: {
    label: "English",
    dir: "ltr",
    currency: "USD",
    timezone: "UTC"
  },
  fa: {
    label: "فارسی",
    dir: "rtl",
    currency: "USD",
    timezone: "Asia/Tehran"
  }
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.includes(value as Locale);
}

/** Cookie that remembers the language a visitor chose; the proxy reads it for URLs without a language prefix. */
export const LOCALE_COOKIE = "locale";

/**
 * The language a visitor with no saved choice gets on a bare URL (/, /login, the installed app's start URL). This trial
 * is Persian-first. `defaultLocale` stays the fallback for message lookups.
 */
export const entryLocale: Locale = "fa";

/** Request header the proxy sets from the URL's language prefix, so the root layout can write <html lang dir>. */
export const LOCALE_HEADER = "x-locale";
