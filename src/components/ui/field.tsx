import type { ReactNode } from "react";

export function Field({
  label,
  hint,
  error,
  children
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
      {error ? <span className="block text-xs text-destructive">{error}</span> : null}
      {hint && !error ? <span className="block text-xs leading-5 text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

