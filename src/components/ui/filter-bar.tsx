import type { ReactNode } from "react";

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 rounded-md border border-border bg-card p-3 md:grid-cols-[1fr_auto_auto_auto]">{children}</div>;
}
