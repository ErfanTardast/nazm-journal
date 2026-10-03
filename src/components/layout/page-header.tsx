import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  eyebrow,
  action
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-border/60 pb-5">
      <div>
        {eyebrow ? <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold tracking-normal text-foreground sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
