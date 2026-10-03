"use client";

import { LoadingState } from "@/components/ui/state";
import { fallbackCopyFor } from "@/lib/i18n/fallback-copy";
import { useLocaleFromPath } from "@/lib/i18n/use-locale";

export default function Loading() {
  const locale = useLocaleFromPath();
  return <LoadingState locale={locale} label={fallbackCopyFor(locale).loading} />;
}
