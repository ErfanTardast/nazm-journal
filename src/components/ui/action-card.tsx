import Link from "next/link";
import type { ReactNode } from "react";

export function ActionCard({
  href,
  title,
  description,
  icon
}: {
  href: string;
  title: string;
  description: string;
  icon?: ReactNode;
}) {
  return (
    <Link href={href} className="block rounded-md border border-border bg-card p-4 transition hover:border-primary/60 hover:bg-primary/5">
      <div className="flex items-start gap-3">
        {icon ? <span className="mt-0.5 text-primary">{icon}</span> : null}
        <span>
          <span className="block text-sm font-semibold text-foreground">{title}</span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
        </span>
      </div>
    </Link>
  );
}
