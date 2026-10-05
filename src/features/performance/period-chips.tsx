"use client";

import { formatCount } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";
import { PERIODS, type PeriodKey } from "@/lib/calculations/performance/types";
import { cn } from "@/lib/utils";

const copy = {
  en: {
    group: "Time period",
    all: "All",
    days: (count: string) => `${count} days`
  },
  fa: {
    group: "بازه‌ی زمانی",
    all: "همه",
    days: (count: string) => `${count} روز`
  }
} as const;

const DAYS: Record<Exclude<PeriodKey, "all">, number> = { "7d": 7, "30d": 30, "90d": 90 };

/** Four chips that choose the window every number on the page covers. The pressed one is the window being shown. */
export function PeriodChips({ period, onChange, locale }: { period: PeriodKey; onChange: (period: PeriodKey) => void; locale: Locale }) {
  const c = copy[locale];
  return (
    <div role="group" aria-label={c.group} className="flex flex-wrap gap-2">
      {PERIODS.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={period === value}
          onClick={() => onChange(value)}
          className={cn(
            "inline-flex min-h-11 items-center justify-center rounded-full border px-4 text-sm font-medium transition",
            period === value ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-muted"
          )}
        >
          {value === "all" ? c.all : c.days(formatCount(DAYS[value], locale))}
        </button>
      ))}
    </div>
  );
}
