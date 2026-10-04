import Link from "next/link";
import { Presentation } from "lucide-react";
import { demoModeEnabled } from "@/lib/demo";
import type { Locale } from "@/lib/i18n/locales";

const copy = {
  en: { label: "Demo mode", open: "Open the walkthrough" },
  fa: { label: "حالت نمایشی", open: "باز کردن راهنمای نمایشی" }
} as const;

export function DemoModeBanner({ locale }: { locale: Locale }) {
  if (!demoModeEnabled()) return null;
  const c = copy[locale];
  return (
    <div className="rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold text-foreground">
          <Presentation className="size-4 text-primary" aria-hidden="true" />
          {c.label}
        </span>
        <Link href={`/${locale}/demo`} className="font-semibold text-primary hover:underline">
          {c.open}
        </Link>
      </div>
    </div>
  );
}
