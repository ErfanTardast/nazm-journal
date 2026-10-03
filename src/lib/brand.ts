import type { Locale } from "@/lib/i18n/locales";

/**
 * The product's name in each language. «نظم» is also an ordinary Persian word ("order, discipline"), so a Persian
 * sentence where the bare word could be read as that word says «اپ نظم» instead, never «برنامه» plus the name (the
 * product avoids «برنامه» for both a plan and an app). The wordmark, page titles and metadata use the bare name;
 * running text uses «اپ نظم».
 */
export const brand: Record<Locale, { name: string; tagline: string }> = {
  en: { name: "Nazm", tagline: "Nazm — the trader's discipline journal" },
  fa: { name: "نظم", tagline: "نظم — دفتر انضباط معامله‌گر" }
};
