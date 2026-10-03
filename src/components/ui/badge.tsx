import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeTone = "default" | "success" | "warning" | "danger";

const tones: Record<BadgeTone, string> = {
  default: "border-border bg-muted text-muted-foreground",
  success: "border-success/30 bg-success/15 text-success",
  warning: "border-warning/30 bg-warning/15 text-warning",
  danger: "border-destructive/30 bg-destructive/15 text-destructive"
};

export function Badge({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}

