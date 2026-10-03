"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { fallbackCopyFor } from "@/lib/i18n/fallback-copy";
import { useLocaleFromPath } from "@/lib/i18n/use-locale";

/** The 404 card in the language of the URL, linking back to that language's workspace (never a fixed /en). */
export function NotFoundView() {
  const locale = useLocaleFromPath();
  const c = fallbackCopyFor(locale);
  return (
    <Card className="mx-auto max-w-md">
      <CardContent className="space-y-4 p-8 text-center">
        <p className="text-sm uppercase text-muted-foreground">404</p>
        <h1 className="text-2xl font-semibold">{c.notFoundTitle}</h1>
        <p className="text-sm text-muted-foreground">{c.notFoundBody}</p>
        <Link className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" href={`/${locale}/dashboard`}>
          {c.backToWorkspace}
        </Link>
      </CardContent>
    </Card>
  );
}
