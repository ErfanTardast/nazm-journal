import { cn } from "@/lib/utils";

export function Sparkline({
  values,
  className,
  label = "Mini trend"
}: {
  values: number[];
  className?: string;
  /** Accessible name of the trend line, in the page language. */
  label?: string;
}) {
  const points = buildPoints(values);
  return (
    <svg className={cn("h-14 w-full overflow-visible", className)} viewBox="0 0 120 42" role="img" aria-label={label}>
      <path d="M0 41H120" stroke="hsl(var(--border))" strokeWidth="1" />
      <path d={points} fill="none" stroke="hsl(var(--primary))" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
    </svg>
  );
}

function buildPoints(values: number[]) {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 120;
      const y = 36 - ((value - min) / range) * 30;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}
