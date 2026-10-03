import { LOCALE_COOKIE, type Locale } from "./locales";

/** Remember the visitor's language choice for a year, so the bare domain and the installed app open in it. */
export function rememberLocale(locale: Locale) {
  try {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // Cookies blocked: the choice just is not remembered.
  }
}
