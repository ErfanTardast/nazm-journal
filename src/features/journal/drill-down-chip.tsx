"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { breakdownLabel } from "@/features/performance/report-labels";
import type { DrillDown } from "@/features/performance/drill-down";
import type { Dimension, LabelKey, PeriodKey } from "@/lib/calculations/performance/types";
import { formatCount } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";
import type { DrillDownTrades } from "./use-drill-down";

const copy = {
  en: {
    showing: "Showing:",
    periods: { "7d": "last 7 days", "30d": "last 30 days", "90d": "last 90 days", all: "all time" } as Record<PeriodKey, string>,
    count: (n: string, count: number) => `${n} ${count === 1 ? "trade" : "trades"}`,
    loading: "Loading these trades...",
    failed: "Those trades could not be loaded, so every trade is shown.",
    clear: "Show all trades"
  },
  fa: {
    showing: "نمایش:",
    periods: { "7d": "۷ روز اخیر", "30d": "۳۰ روز اخیر", "90d": "۹۰ روز اخیر", all: "کل دوران" } as Record<PeriodKey, string>,
    count: (n: string) => `${n} معامله`,
    loading: "در حال بارگذاری این معامله‌ها...",
    failed: "این معامله‌ها بارگذاری نشد؛ همه‌ی معامله‌ها نمایش داده می‌شوند.",
    clear: "نمایش همه‌ی معاملات"
  }
} as const;

/** The fields of a trade the Performance breakdowns group by; a journal trade has them all. */
type Labelled = {
  id: string;
  symbol: string;
  session: string | null;
  setupType: string | null;
  strategy?: { name: string } | null;
  journalEntry?: { emotionalState?: string | null; mistakes?: string[] } | null;
};

const before = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0); // code units, as the report settles a tie

/** The words the trader wrote for a dimension, in the trade (the Performance rows group on these, ignoring case). */
function wordsOf(dimension: Dimension, trade: Labelled): Array<string | null | undefined> {
  switch (dimension) {
    case "strategy":
      return [trade.strategy?.name];
    case "symbol":
      return [trade.symbol];
    case "session":
      return [trade.session];
    case "setup":
      return [trade.setupType];
    case "mistake":
      return trade.journalEntry?.mistakes ?? [];
    case "emotion":
      return [trade.journalEntry?.emotionalState];
    default:
      return [];
  }
}

/**
 * What the row is called. A key row (a weekday, a market, a side, a session) has the Performance page's words. A row
 * of the trader's own words has only its folded text in the address, so the spelling comes from the row's own trades:
 * the one used most (a tie goes to the smaller one), as on the Performance page.
 */
export function rowLabel(drill: DrillDown, trades: Labelled[], locale: Locale): string {
  const [kind, ...rest] = drill.row.split(":");
  const id = rest.join(":");
  if (kind === "key") {
    try {
      return breakdownLabel({ kind: "key", key: id as LabelKey }, locale) || id;
    } catch {
      return id; // a key this page does not know (a hand-made address)
    }
  }
  const spellings = new Map<string, number>();
  for (const trade of trades) {
    // One count per trade, for the first spelling it has of this row's text.
    const spelling = wordsOf(drill.dimension, trade)
      .map((word) => word?.trim() ?? "")
      .find((word) => word && word.toLowerCase() === id);
    if (spelling) spellings.set(spelling, (spellings.get(spelling) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [spelling, count] of spellings) {
    if (count > bestCount || (count === bestCount && before(spelling, best) < 0)) {
      best = spelling;
      bestCount = count;
    }
  }
  return best || id;
}

/**
 * Says which Performance row the journal list is narrowed to, and clears it: the three parameters leave the address
 * (router.replace) and the whole journal is listed again. A failed load says so in a line and lists every trade.
 */
export function DrillDownChip({ drill, locale, trades }: { drill: Exclude<DrillDownTrades, { status: "none" }>; locale: Locale; trades: Labelled[] }) {
  const c = copy[locale];
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function clear() {
    const rest = new URLSearchParams(params?.toString());
    for (const name of ["period", "dimension", "row"]) rest.delete(name);
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  let text: string;
  if (drill.status === "loading") text = c.loading;
  else if (drill.status === "failed") text = c.failed;
  else {
    const ids = drill.ids;
    const label = rowLabel(drill.drill, trades.filter((trade) => ids.has(trade.id)), locale);
    text = `${c.showing} ${label} · ${c.periods[drill.drill.period]} (${c.count(formatCount(ids.size, locale), ids.size)})`;
  }

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/10 ps-4 pe-1 text-sm text-foreground"
    >
      <span className="min-w-0 break-words py-2">{text}</span>
      <button
        type="button"
        onClick={clear}
        aria-label={c.clear}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
