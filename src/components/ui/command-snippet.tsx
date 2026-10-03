"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A read-only, copy-to-clipboard command snippet. It ONLY writes text to the clipboard — it never
 * runs a command, never calls a server action, and never starts an OS process. The operator runs
 * the command themselves in their own terminal.
 */
export function CommandSnippet({
  command,
  label,
  copyLabel,
  className
}: {
  command: string;
  label?: string;
  copyLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable; no-op (copy-only, never executes)
    }
  }

  return (
    <div className={cn("rounded-md border border-border bg-muted/40 p-3", className)}>
      {label ? <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p> : null}
      <div className="flex items-center gap-2">
        <code dir="ltr" className="min-w-0 flex-1 overflow-x-auto whitespace-pre text-left text-xs text-foreground">{command}</code>
        <button
          type="button"
          onClick={copy}
          aria-label={copyLabel ?? "Copy to clipboard"}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          {copied ? <Check className="size-4 text-success" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
