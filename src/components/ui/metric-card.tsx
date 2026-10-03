import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = "default"
}: {
  label: string;
  value: string;
  detail?: string;
  icon?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive"
  }[tone];

  return (
    <div className="rounded-md border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        {icon ? <span className="text-primary">{icon}</span> : null}
      </div>
      <p className={cn("mt-3 text-2xl font-semibold tracking-normal", toneClass)}>{value}</p>
      {detail ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p> : null}
    </div>
  );
}
