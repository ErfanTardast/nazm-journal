"use client";

import { ErrorState } from "@/components/ui/state";
import { fallbackCopyFor } from "@/lib/i18n/fallback-copy";
import { useLocaleFromPath } from "@/lib/i18n/use-locale";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const c = fallbackCopyFor(useLocaleFromPath());
  return (
    <div className="space-y-4">
      {/* The raw error text is for the server log, not for the visitor; the digest lets the owner find it there. */}
      <ErrorState title={c.errorTitle} description={error.digest ? `${c.errorBody} (${c.errorReference}: ${error.digest})` : c.errorBody} />
      <button className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" onClick={reset}>
        {c.tryAgain}
      </button>
    </div>
  );
}
