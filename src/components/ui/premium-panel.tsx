import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PremiumPanel({
  children,
  className,
  glow = false
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border/80 bg-card/90 shadow-sm shadow-black/30 ring-1 ring-white/[0.03]",
        glow && "before:absolute before:inset-x-8 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-primary/70 before:to-transparent",
        className
      )}
    >
      {children}
    </div>
  );
}
