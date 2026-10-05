import type { BreakdownLabel, LabelKey } from "@/lib/calculations/performance/types";
import type { Locale } from "@/lib/i18n/locales";

/*
 * The report holds keys, never words: this turns a breakdown row's label into the page's language. The trader's own
 * words (a strategy, a symbol, a mistake tag, an emotion) come back exactly as they wrote them.
 */
const words = {
  en: {
    none: "Unspecified",
    "market.crypto": "Crypto",
    "market.forex": "Forex",
    "market.stocks": "Global Stocks",
    "side.long": "Long",
    "side.short": "Short",
    "session.asia": "Asia",
    "session.london": "London",
    "session.new_york": "New York",
    "session.london_new_york": "London–New York overlap",
    "session.off_hours": "Outside the main sessions",
    "setup.from_plan": "From a plan"
  },
  fa: {
    none: "نامشخص",
    "market.crypto": "کریپتو",
    "market.forex": "فارکس",
    "market.stocks": "سهام جهانی",
    "side.long": "لانگ",
    "side.short": "شورت",
    "session.asia": "آسیا",
    "session.london": "لندن",
    "session.new_york": "نیویورک",
    "session.london_new_york": "همپوشانی لندن و نیویورک",
    "session.off_hours": "خارج از سشن‌های اصلی",
    "setup.from_plan": "از روی پلن"
  }
} as const satisfies Record<Locale, Partial<Record<LabelKey, string>>>;

/** 0 = Sunday, as the report numbers weekdays. 1 January 2023 was a Sunday. */
function weekdayName(index: number, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2023, 0, 1 + index)));
}

export function breakdownLabel(label: BreakdownLabel, locale: Locale): string {
  if (label.kind === "text") return label.text;
  if (label.key.startsWith("weekday.")) return weekdayName(Number(label.key.slice("weekday.".length)), locale);
  return words[locale][label.key as keyof (typeof words)[Locale]];
}
