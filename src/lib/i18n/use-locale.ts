"use client";

import { usePathname } from "next/navigation";
import { entryLocale, isLocale, type Locale } from "./locales";

/**
 * The language of the page being shown, read from the URL's prefix. For the fallbacks (loading, error, 404) that render
 * outside a page and so never receive a locale prop; a URL without a language reads as the Persian entry language.
 */
export function useLocaleFromPath(): Locale {
  const first = usePathname()?.split("/")[1];
  return isLocale(first) ? first : entryLocale;
}
