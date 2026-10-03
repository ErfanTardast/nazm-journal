import { cn } from "@/lib/utils";

export function ProgressRing({
  value,
  label,
  className
}: {
  value: number;
  label?: string;
  className?: string;
}) {
  const normalized = Math.max(0, Math.min(1, value));
  const degrees = Math.round(normalized * 360);

  return (
    <div
      className={cn("grid size-24 place-items-center rounded-full", className)}
      style={{
        background: `conic-gradient(hsl(var(--primary)) ${degrees}deg, hsl(var(--muted)) ${degrees}deg)`
      }}
      aria-label={label ?? `${Math.round(normalized * 100)} percent complete`}
      role="img"
    >
      <div className="grid size-20 place-items-center rounded-full bg-card">
        <span className="text-lg font-semibold text-foreground">{Math.round(normalized * 100)}%</span>
      </div>
    </div>
  );
}
