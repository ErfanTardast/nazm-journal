import { cn } from "@/lib/utils";

type BarTone = "primary" | "success" | "warning" | "danger";
type BarDatum = {
  label: string;
  value: number;
  tone?: BarTone;
};

// The tallest bar: 104 px plus a row of labels fills the 128 px the chart always took.
const TRACK_HEIGHT_PX = 104;

export function MiniBars({
  values,
  labels,
  tone = "primary",
  data,
  valueFormatter,
  emptyLabel = "No data yet."
}: {
  values?: number[];
  labels?: string[];
  tone?: BarTone;
  data?: BarDatum[];
  valueFormatter?: (value: number) => string;
  emptyLabel?: string;
}) {
  const bars = data ?? (values ?? []).map((value, index) => ({ value, label: labels?.[index] ?? "", tone }));
  const max = Math.max(...bars.map((bar) => Math.abs(bar.value)), 1);

  if (bars.length === 0) {
    return <p className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="flex gap-2">
      {bars.map((bar, index) => (
        <div key={`${bar.label}-${index}`} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          {/* A percentage height needs a parent with a height of its own: this track has a fixed one, the bar fills a share of it. */}
          <div className="flex w-full items-end" style={{ height: `${TRACK_HEIGHT_PX}px` }}>
            <div
              className={cn("w-full rounded-t-sm opacity-90", barColor(bar.tone ?? tone))}
              style={{ height: `${Math.max((Math.abs(bar.value) / max) * 100, 4)}%` }}
              title={valueFormatter ? valueFormatter(bar.value) : String(bar.value)}
            />
          </div>
          {bar.label ? <span className="max-w-full truncate text-[10px] text-muted-foreground">{bar.label}</span> : null}
        </div>
      ))}
    </div>
  );
}

function barColor(tone: BarTone) {
  if (tone === "success") return "bg-success";
  if (tone === "warning") return "bg-warning";
  if (tone === "danger") return "bg-destructive";
  return "bg-primary";
}
