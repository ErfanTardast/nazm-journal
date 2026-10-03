import { ShieldCheck } from "lucide-react";

export function SafeAIMessage({ children }: { children: string }) {
  return (
    <div className="rounded-md border border-warning/30 bg-warning/10 p-4 text-sm leading-6 text-warning">
      <ShieldCheck className="me-2 inline size-4" aria-hidden="true" />
      {children}
    </div>
  );
}
