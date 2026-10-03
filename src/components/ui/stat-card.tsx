import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  detail,
  tone = "default",
  compact = false
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "success" | "danger" | "warning";
  compact?: boolean;
}) {
  return (
    <Card className="transition hover:border-primary/30">
      <CardContent className={compact ? "p-4" : "p-5"}>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p
          className={cn(
            "mt-2 font-semibold",
            compact ? "text-xl" : "text-2xl",
            tone === "success" && "text-success",
            tone === "danger" && "text-destructive",
            tone === "warning" && "text-warning"
          )}
        >
          {value}
        </p>
        {detail ? <p className="mt-2 text-xs text-muted-foreground">{detail}</p> : null}
      </CardContent>
    </Card>
  );
}
