import { cn } from "@/lib/utils";

type BarTone = "primary" | "success" | "warning" | "danger";
type BarDatum = {
  label: string;
  value: number;
  tone?: BarTone;
};

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
    <div className="flex h-32 items-end gap-2">
      {bars.map((bar, index) => (
        <div key={`${bar.label}-${index}`} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div
            className={cn("w-full rounded-t-sm opacity-90", barColor(bar.tone ?? tone))}
            style={{ height: `${Math.max((Math.abs(bar.value) / max) * 100, 4)}%` }}
            title={valueFormatter ? valueFormatter(bar.value) : String(bar.value)}
          />
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
