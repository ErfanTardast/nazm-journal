import type { ReactNode } from "react";

export function InsightCard({
  title,
  children,
  tone = "default"
}: {
  title: string;
  children: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const borderClass = {
    default: "border-border",
    success: "border-success/30 bg-success/5",
    warning: "border-warning/30 bg-warning/5",
    danger: "border-destructive/30 bg-destructive/5"
  }[tone];

  return (
    <div className={`rounded-md border p-4 ${borderClass}`}>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <div className="mt-2 text-sm leading-6 text-muted-foreground">{children}</div>
    </div>
  );
}
