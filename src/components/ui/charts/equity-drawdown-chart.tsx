import { dayKey } from "@/lib/calculations/performance/time";
import type { EquityPoint } from "@/lib/calculations/performance/types";
import { formatCount, formatMoney, formatShortDay, formatSignedMoney } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";

const copy = {
  en: {
    title: "Equity curve and drawdown",
    equity: "Equity: running total of results, after fees",
    drawdown: "Drawdown: distance below the highest point so far",
    trade: (n: string) => `Trade ${n}`,
    summary: (trades: string, last: string, deepest: string) =>
      `${trades} closed trades with a money value. Equity at the last trade ${last}. Deepest drawdown ${deepest}.`,
    empty: "Two or more closed trades with a money value are needed to draw the curve."
  },
  fa: {
    title: "منحنی سرمایه و افت",
    equity: "سرمایه: مجموع نتیجه‌ها تا هر معامله، پس از کسر کارمزد",
    drawdown: "افت: فاصله از بالاترین نقطه‌ی منحنی تا همان لحظه",
    trade: (n: string) => `معامله‌ی ${n}`,
    summary: (trades: string, last: string, deepest: string) =>
      `${trades} معامله‌ی بسته‌ی دارای ارزش پولی. سرمایه در آخرین معامله ${last}. عمیق‌ترین افت ${deepest}.`,
    empty: "برای رسم منحنی دو معامله‌ی بسته یا بیشتر با ارزش پولی لازم است."
  }
} as const;

/** Width of the value labels left of each plot; the date row below uses the same gutter so the two line up. */
const GUTTER = "w-[4.75rem]";
const LABEL = "text-[11px] leading-4 tabular-nums text-muted-foreground";
/** The plot is drawn in a 0-100 box stretched over its element; lines keep a constant pixel width. */
const INSET = 4;
const toY = (fraction: number) => INSET + fraction * (100 - 2 * INSET);
/** How far down the drawdown area reaches at its deepest point (a share of its box). */
const DEPTH = 100 - 2 * INSET;

/**
 * The equity line above and the under-water drawdown area below, on one x-axis (one step per trade). Every label is
 * HTML outside the SVG, so text stays at its real size on a 360 px screen, and the whole chart is `dir="ltr"`: time
 * runs left to right and the labels sit left of the plot in both languages.
 */
export function EquityDrawdownChart({ points, locale, timeZone }: { points: EquityPoint[]; locale: Locale; timeZone: string }) {
  const c = copy[locale];

  if (points.length < 2) {
    return (
      <div className="flex h-72 min-h-72 items-center justify-center rounded-md border border-dashed border-border bg-background/30 px-6 text-center text-sm text-muted-foreground">
        {c.empty}
      </div>
    );
  }

  const first = points[0];
  const last = points[points.length - 1];
  const equities = points.map((point) => point.equity);
  const rawMin = Math.min(...equities);
  const rawMax = Math.max(...equities);
  const pad = rawMin === rawMax ? Math.max(Math.abs(rawMax) * 0.5, 1) : 0;
  const min = rawMin - pad;
  const max = rawMax + pad;
  const range = max - min;
  const deepest = Math.max(...points.map((point) => point.drawdown));
  const x = (index: number) => ((index / (points.length - 1)) * 100).toFixed(2);
  const yEquity = (value: number) => toY(1 - (value - min) / range);
  const line = points.map((point, index) => `${x(index)},${yEquity(point.equity).toFixed(2)}`).join(" ");
  const zeroY = min < 0 && max > 0 ? yEquity(0) : null;
  const area = deepest > 0 ? `0,0 ${points.map((point, index) => `${x(index)},${((point.drawdown / deepest) * DEPTH).toFixed(2)}`).join(" ")} 100,0` : null;
  const edge = (point: EquityPoint) => ({ day: formatShortDay(dayKey(point.at, timeZone), locale), trade: c.trade(formatCount(point.n, locale)) });
  const [start, end] = [edge(first), edge(last)];

  const summary = c.summary(formatCount(points.length, locale), formatSignedMoney(last.equity, locale), formatMoney(deepest, locale));
  const labelClass = `absolute end-0 -translate-y-1/2 ${LABEL}`;

  return (
    <div dir="ltr" role="img" aria-label={`${c.title}. ${summary}`} className="w-full min-w-0 space-y-3" data-chart="equity-drawdown">
      <div className="space-y-1">
        <p className={LABEL}>{c.equity}</p>
        <div className="flex gap-2">
          <div className={`relative h-44 shrink-0 ${GUTTER}`}>
            {[
              [max, yEquity(max)],
              [min + range / 2, yEquity(min + range / 2)],
              [min, yEquity(min)]
            ].map(([value, top]) => (
              <span key={top} data-chart-tick="equity" className={labelClass} style={{ top: `${top}%` }}>
                {formatMoney(value, locale)}
              </span>
            ))}
          </div>
          <div className="relative h-44 min-w-0 flex-1 rounded-sm border border-border/70 bg-background/30">
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {[toY(0), toY(0.5), toY(1)].map((y) => (
                <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="hsl(var(--border))" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
              ))}
              {zeroY !== null ? (
                <line x1="0" x2="100" y1={zeroY} y2={zeroY} stroke="hsl(var(--muted-foreground))" strokeOpacity="0.6" vectorEffect="non-scaling-stroke" />
              ) : null}
              <polyline
                data-chart-part="equity-line"
                points={line}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <span
              data-chart-part="last-point"
              className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary"
              style={{ left: "100%", top: `${yEquity(last.equity)}%` }}
            />
          </div>
        </div>
      </div>

      {area ? (
        <div className="space-y-1">
          <p className={LABEL}>{c.drawdown}</p>
          <div className="flex gap-2">
            <div className={`relative h-20 shrink-0 ${GUTTER}`}>
              <span data-chart-tick="drawdown" className={`${labelClass} top-0`}>
                {formatMoney(0, locale)}
              </span>
              <span data-chart-tick="drawdown" className={labelClass} style={{ top: `${DEPTH}%` }}>
                {formatSignedMoney(-deepest, locale)}
              </span>
            </div>
            <div className="relative h-20 min-w-0 flex-1 border-t border-border/70">
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <polygon data-chart-part="drawdown-area" points={area} fill="hsl(var(--destructive))" fillOpacity="0.28" stroke="hsl(var(--destructive))" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex gap-2">
        <div className={`shrink-0 ${GUTTER}`} />
        <div className="flex min-w-0 flex-1 justify-between gap-2">
          <div data-chart-label="first" className={LABEL}>
            <span className="block">{start.day}</span> <span className="block">{start.trade}</span>
          </div>
          <div data-chart-label="last" className={`${LABEL} text-end`}>
            <span className="block">{end.day}</span> <span className="block">{end.trade}</span>
          </div>
        </div>
      </div>

      <p dir={locale === "fa" ? "rtl" : "ltr"} className="text-xs leading-5 text-muted-foreground">
        {summary}
      </p>
    </div>
  );
}
