import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/state";
import { cn } from "@/lib/utils";

export function MobileDataList<T>({
  rows,
  emptyTitle,
  emptyDescription,
  getKey,
  render
}: {
  rows: T[];
  emptyTitle: string;
  emptyDescription: string;
  getKey: (row: T, index: number) => string;
  render: (row: T, index: number) => ReactNode;
}) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div
          key={getKey(row, index)}
          className={cn(
            "rounded-lg border border-border/80 bg-card/90 p-4 shadow-sm shadow-black/10",
            "ring-1 ring-white/[0.03]"
          )}
        >
          {render(row, index)}
        </div>
      ))}
    </div>
  );
}
