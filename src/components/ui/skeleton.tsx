import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export function CardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-4 h-8 w-40" />
      <Skeleton className="mt-3 h-3 w-full" />
    </div>
  );
}

