"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { dayKey } from "@/lib/calculations/performance/time";
import { formatR, formatShortDay, formatSignedMoney } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";
import type { RecentTrade } from "./overview-types";

const copy = {
  en: {
    title: "Recent trades",
    what: "The latest trades by close time; an open trade by its open time.",
    link: "Open the journal",
    sample: "Sample data",
    sides: { long: "Long", short: "Short" },
    open: "Open",
    closed: (day: string) => `Closed ${day}`,
    notReviewed: "Not reviewed",
    noResult: "No result yet",
    empty: "No trades yet. Import your MT5 report or log a trade; the latest ones will show here."
  },
  fa: {
    title: "معاملات اخیر",
    what: "آخرین معامله‌ها بر اساس زمان بسته شدن؛ معامله‌ی باز بر اساس زمان باز شدن.",
    link: "باز کردن ژورنال",
    sample: "داده نمونه",
    sides: { long: "لانگ", short: "شورت" },
    open: "باز",
    closed: (day: string) => `بسته شد: ${day}`,
    notReviewed: "مرور نشده",
    noResult: "هنوز نتیجه‌ای نیست",
    empty: "هنوز معامله‌ای نیست. گزارش MT5 را وارد کنید یا معامله‌ای ثبت کنید؛ آخرین‌ها اینجا نشان داده می‌شوند."
  }
} as const;

/** The latest trades with their result, and a "Not reviewed" mark on the ones with no rule verdict yet. */
export function RecentTrades({ trades, timeZone, sample, locale }: { trades: RecentTrade[]; timeZone: string; sample: boolean; locale: Locale }) {
  const c = copy[locale];

  return (
    <section aria-labelledby="dashboard-recent" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="dashboard-recent" className="text-lg font-semibold text-foreground">
            {c.title}
          </h2>
          {sample ? <Badge tone="warning">{c.sample}</Badge> : null}
        </div>
        <Link href={`/${locale}/journal`} className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-2 hover:no-underline">
          {c.link}
        </Link>
      </div>
      {trades.length === 0 ? (
        <p className="rounded-lg border border-border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">{c.empty}</p>
      ) : (
        <>
          <p className="text-xs leading-5 text-muted-foreground">{c.what}</p>
          <ul className="space-y-2">
            {trades.map((trade) => {
              const result = [trade.realizedPnl === null ? null : formatSignedMoney(trade.realizedPnl, locale), trade.rMultiple === null ? null : formatR(trade.rMultiple, locale)].filter(Boolean).join(" · ");
              const tone = trade.realizedPnl === null ? "" : trade.realizedPnl > 0 ? "text-success" : trade.realizedPnl < 0 ? "text-destructive" : "";
              return (
                <li key={trade.id} data-trade={trade.id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-border bg-muted/20 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      <span dir="ltr">{trade.symbol}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {c.sides[trade.side]} · {trade.status === "closed" && trade.closedAt ? c.closed(formatShortDay(dayKey(trade.closedAt, timeZone), locale)) : c.open}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("text-sm font-semibold text-foreground", tone)}>{result || c.noResult}</span>
                    {trade.reviewed ? null : <Badge tone="warning">{c.notReviewed}</Badge>}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
