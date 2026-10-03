import { SectionPanel } from "@/components/ui/section-panel";
import { formatMoney, formatPercent } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type { AnalyticsGroup } from "@/lib/calculations/analytics";
import type { Locale } from "@/lib/i18n/locales";

type Labels = {
  trades: string;
  winRate: string;
  avgR: string;
  empty: string;
};

/**
 * Visual per-dimension performance breakdown: one row per group with a diverging
 * net P&L bar (green right / red left of a zero baseline) plus win rate and avg R.
 */
export function AnalyticsBreakdown({
  title,
  description,
  rows,
  locale,
  labels,
  limit = 8
}: {
  title: string;
  description?: string;
  rows: AnalyticsGroup[];
  locale: Locale;
  labels: Labels;
  limit?: number;
}) {
  const visible = rows.slice(0, limit);
  const maxAbs = Math.max(...visible.map((row) => Math.abs(row.netPnl)), 1);

  return (
    <SectionPanel title={title} description={description}>
      {visible.length === 0 ? (
        <p className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((row) => {
            const positive = row.netPnl >= 0;
            const magnitude = `${Math.max((Math.abs(row.netPnl) / maxAbs) * 100, 2)}%`;
            return (
              <li key={row.key} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{row.key}</span>
                  <span className={cn("shrink-0 tabular-nums font-semibold", positive ? "text-success" : "text-destructive")}>
                    {formatMoney(row.netPnl, locale)}
                  </span>
                </div>
                <div className="flex items-stretch gap-px" aria-hidden>
                  <div className="flex flex-1 justify-end">
                    {!positive ? <div className="h-2.5 rounded-l-sm bg-destructive/80" style={{ width: magnitude }} /> : null}
                  </div>
                  <div className="w-px bg-border" />
                  <div className="flex flex-1 justify-start">
                    {positive ? <div className="h-2.5 rounded-r-sm bg-success/80" style={{ width: magnitude }} /> : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
                  <span>
                    {labels.trades}: <span className="text-foreground">{row.count}</span>
                  </span>
                  <span>
                    {labels.winRate}: <span className="text-foreground">{row.decided > 0 ? formatPercent(row.winRate, locale) : "—"}</span>
                  </span>
                  <span>
                    {labels.avgR}: <span className="text-foreground">{row.hasR ? `${row.avgR.toFixed(2)}R` : "—"}</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionPanel>
  );
}
