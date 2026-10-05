"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SectionPanel } from "@/components/ui/section-panel";
import type { BreakdownLabel, BreakdownRow } from "@/lib/calculations/performance/types";
import { formatCount, formatPercent, formatR, formatSignedMoney } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

const copy = {
  en: {
    entries: "Entries",
    winRate: "Win rate",
    avgR: "Avg R",
    showAll: (n: string) => `Show all (${n})`,
    showFewer: "Show fewer",
    worstFirst: "Worst first",
    fewTrades: "Few trades",
    seeTrades: "See these trades",
    derived: "(by open time)",
    unpriced: (n: string) => `${n} without a money value`,
    empty: "Add more journal entries to populate this review."
  },
  fa: {
    entries: "ورودها",
    winRate: "نرخ برد",
    avgR: "میانگین R",
    showAll: (n: string) => `نمایش همه (${n})`,
    showFewer: "نمایش کمتر",
    worstFirst: "بدترین‌ها اول",
    fewTrades: "معامله کم",
    seeTrades: "دیدن این معامله‌ها",
    derived: "(از ساعت باز شدن)",
    unpriced: (n: string) => `${n} بدون ارزش پولی`,
    empty: "برای تکمیل این مرور، ورودی‌های ژورنال بیشتری اضافه کنید."
  }
} as const;

const DASH = "—";
const COLLAPSED_ROWS = 5;
const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-md border px-3 text-sm font-medium transition hover:bg-muted";

/**
 * One breakdown of the period's entries: a row per group with a diverging net-result bar (loss to the left in red,
 * profit to the right in green, whatever the page language), plus entries, win rate and average R. Five rows show
 * first; the rest are one tap away, and the order can be flipped to see the worst first.
 */
export function AnalyticsBreakdown({
  title,
  description,
  rows,
  locale,
  resolveLabel,
  rowHref
}: {
  title: string;
  description?: string;
  rows: BreakdownRow[];
  locale: Locale;
  /** Turns a row's label (a key or the trader's own text) into words in the page language. */
  resolveLabel: (label: BreakdownLabel) => string;
  /** Where "See these trades" goes for a row; without it the rows carry no link. */
  rowHref?: (row: BreakdownRow) => string;
}) {
  const c = copy[locale];
  const [showAll, setShowAll] = useState(false);
  const [worstFirst, setWorstFirst] = useState(false);

  const ordered = worstFirst ? [...rows].sort((a, b) => a.netPnl - b.netPnl || b.entries - a.entries) : rows;
  const visible = showAll ? ordered : ordered.slice(0, COLLAPSED_ROWS);
  const maxAbs = Math.max(...visible.map((row) => Math.abs(row.netPnl)), 0);

  return (
    <SectionPanel title={title} description={description} className="min-w-0">
      {rows.length === 0 ? (
        <p className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">{c.empty}</p>
      ) : (
        <div className="space-y-4">
          <ul className="space-y-4">
            {visible.map((row) => {
              const magnitude = maxAbs > 0 ? `${Math.max((Math.abs(row.netPnl) / maxAbs) * 100, 2)}%` : "0%";
              return (
                <li key={row.id} className="min-w-0 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 flex-1 break-words font-medium text-foreground">
                      <span data-row-label>{resolveLabel(row.label)}</span>
                      {row.derived ? (
                        <>
                          {" "}
                          <span className="text-xs font-normal text-muted-foreground">{c.derived}</span>
                        </>
                      ) : null}
                      {row.lowSample ? (
                        <>
                          {" "}
                          <span className="ms-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-normal text-muted-foreground">{c.fewTrades}</span>
                        </>
                      ) : null}
                    </span>
                    <span className={cn("shrink-0 tabular-nums font-semibold", row.netPnl > 0 ? "text-success" : row.netPnl < 0 ? "text-destructive" : "text-muted-foreground")}>
                      {formatSignedMoney(row.netPnl, locale)}
                    </span>
                  </div>
                  <div data-track dir="ltr" className="flex items-stretch gap-px" aria-hidden>
                    <div className="flex flex-1 justify-end">
                      {row.netPnl < 0 ? <div data-bar="loss" className="h-2.5 rounded-s-sm bg-destructive/80" style={{ width: magnitude }} /> : null}
                    </div>
                    <div className="w-px bg-border" />
                    <div className="flex flex-1 justify-start">
                      {row.netPnl > 0 ? <div data-bar="profit" className="h-2.5 rounded-e-sm bg-success/80" style={{ width: magnitude }} /> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
                    <span>
                      {c.entries}: <span className="text-foreground">{formatCount(row.entries, locale)}</span>
                    </span>
                    <span>
                      {c.winRate}: <span className="text-foreground">{row.winRate === null ? DASH : formatPercent(row.winRate, locale)}</span>
                    </span>
                    <span>
                      {c.avgR}: <span className="text-foreground">{row.averageR === null ? DASH : formatR(row.averageR, locale)}</span>
                    </span>
                    {row.unpriced > 0 ? <span>{c.unpriced(formatCount(row.unpriced, locale))}</span> : null}
                    {rowHref ? (
                      // 44 px to tap, taken out of the line's height with negative margins so the rows stay compact.
                      <Link
                        href={rowHref(row)}
                        aria-label={`${c.seeTrades}: ${resolveLabel(row.label)}`}
                        className="-my-3.5 ms-auto inline-flex min-h-11 items-center gap-1 text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {c.seeTrades}
                        <ArrowUpRight className="size-3 rtl:-scale-x-100" aria-hidden="true" />
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap gap-2">
            {rows.length > COLLAPSED_ROWS ? (
              <button type="button" onClick={() => setShowAll((value) => !value)} className={cn(BUTTON, "border-border text-foreground")}>
                {showAll ? c.showFewer : c.showAll(formatCount(rows.length, locale))}
              </button>
            ) : null}
            {rows.length > 1 ? (
              <button
                type="button"
                aria-pressed={worstFirst}
                onClick={() => setWorstFirst((value) => !value)}
                className={cn(BUTTON, worstFirst ? "border-primary bg-primary/10 text-foreground" : "border-border text-foreground")}
              >
                {c.worstFirst}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </SectionPanel>
  );
}
