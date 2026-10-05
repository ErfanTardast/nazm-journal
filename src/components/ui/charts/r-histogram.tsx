import type { RBucketKey, RHistogram as RHistogramData } from "@/lib/calculations/performance/types";
import { formatCount, formatNumber, formatR } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

const copy = {
  en: {
    list: "Entries by result in R",
    below: (edge: string) => `Below ${edge}`,
    from: (edge: string) => `${edge} or more`,
    between: (from: string, to: string) => `${from} to ${to}`,
    entries: (label: string, n: string, count: number) => `${label}: ${n} ${count === 1 ? "entry" : "entries"}`,
    empty: "No entry with an R in this period.",
    withoutR: (n: string, count: number) => `${n} ${count === 1 ? "trade" : "trades"} without R (no stop) ${count === 1 ? "is" : "are"} not in this chart.`,
    note: "Each bar counts entries (ladder legs together) by the R they ended at. Left of 0 is a loss, right of it a profit."
  },
  fa: {
    list: "ورودها بر اساس نتیجه بر حسب R",
    below: (edge: string) => `کمتر از ${edge}`,
    from: (edge: string) => `${edge} یا بیشتر`,
    between: (from: string, to: string) => `${from} تا ${to}`,
    entries: (label: string, n: string) => `${label}: ${n} ورود`,
    empty: "در این بازه ورودی‌ای که R داشته باشد نیست.",
    withoutR: (n: string) => `${n} معامله بدون R (بدون حد ضرر) در این نمودار نیست.`,
    note: "هر ستون ورودها (پله‌های یک ورود با هم) را بر اساس R پایانی‌شان می‌شمارد. سمت چپ صفر ضرر است و سمت راست آن سود."
  }
} as const;

const NBSP = String.fromCharCode(0xa0);
const LRI = String.fromCharCode(0x2066);
/** The bars stay at least this tall, so one entry next to a hundred is still a bar. */
const MIN_VISIBLE_PERCENT = 3;

/** A bucket edge: "0", "-1R", "+2R". A positive edge carries its plus (inside the left-to-right isolate on the Persian page). */
function edge(value: number, locale: Locale) {
  if (value === 0) return formatNumber(0, locale);
  const text = formatR(value, locale, 0);
  if (value < 0) return text;
  return locale === "fa" ? text.replace(LRI, `${LRI}+`) : `+${text}`;
}

function bucketLabel(bucket: { from: number | null; to: number | null }, locale: Locale) {
  const c = copy[locale];
  if (bucket.from === null) return c.below(edge(bucket.to ?? 0, locale));
  if (bucket.to === null) return c.from(edge(bucket.from, locale));
  // The last part is glued to its "to", so a narrow column breaks between the two edges and never inside one.
  return c.between(edge(bucket.from, locale), edge(bucket.to, locale)).replace(/ (\S+)$/, `${NBSP}$1`);
}

const isLoss = (bucket: { to: number | null }) => bucket.to !== null && bucket.to <= 0;
const isProfit = (bucket: { from: number | null }) => bucket.from !== null && bucket.from >= 0;

/**
 * Entries in seven buckets of their result in R, as a column chart on a number line: losses on the left in the loss
 * colour, profits on the right in the profit colour, every label carrying its sign so colour is never the only signal.
 * It is `dir="ltr"` in both languages (the number line does not mirror); each label sets its own direction.
 */
export function RHistogram({ histogram, locale }: { histogram: RHistogramData; locale: Locale }) {
  const c = copy[locale];
  const max = Math.max(...histogram.buckets.map((bucket) => bucket.count));
  const note = histogram.withoutR > 0 ? <p className="text-xs text-muted-foreground">{c.withoutR(formatCount(histogram.withoutR, locale), histogram.withoutR)}</p> : null;

  if (max === 0) {
    return (
      <div dir="ltr" className="space-y-3">
        <p dir={locale === "fa" ? "rtl" : "ltr"} className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          {c.empty}
        </p>
        {note}
      </div>
    );
  }

  return (
    <div dir="ltr" className="min-w-0 space-y-3">
      <ol aria-label={c.list} className="flex gap-1">
        {histogram.buckets.map((bucket) => {
          const label = bucketLabel(bucket, locale);
          const percent = bucket.count === 0 ? 0 : Math.max((bucket.count / max) * 100, MIN_VISIBLE_PERCENT);
          const tone = isLoss(bucket) ? "destructive" : isProfit(bucket) ? "success" : "primary";
          const count = formatCount(bucket.count, locale);
          return (
            <li key={bucket.key satisfies RBucketKey} aria-label={c.entries(label.replaceAll(NBSP, " "), count, bucket.count)} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <div className="relative mt-5 h-24 w-full border-b border-border">
                <div
                  data-bucket={bucket.key}
                  className={cn("absolute inset-x-0 bottom-0 rounded-t-sm", tone === "destructive" ? "bg-destructive/80" : tone === "success" ? "bg-success/80" : "bg-primary/80")}
                  style={{ height: `${percent}%` }}
                />
                <span
                  className={cn("absolute inset-x-0 text-center text-xs font-semibold tabular-nums", tone === "destructive" ? "text-destructive" : "text-success")}
                  style={{ bottom: `calc(${percent}% + 2px)` }}
                >
                  {count}
                </span>
              </div>
              <span dir={locale === "fa" ? "rtl" : "ltr"} className="w-full text-center text-[11px] leading-tight text-muted-foreground">
                {label}
              </span>
            </li>
          );
        })}
      </ol>
      <p dir={locale === "fa" ? "rtl" : "ltr"} className="text-xs text-muted-foreground">
        {c.note}
      </p>
      {note}
    </div>
  );
}
