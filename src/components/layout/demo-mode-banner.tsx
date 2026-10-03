import Link from "next/link";
import { Presentation } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { demoModeEnabled } from "@/lib/demo";
import type { Locale } from "@/lib/i18n/locales";

export function DemoModeBanner({ locale }: { locale: Locale }) {
  if (!demoModeEnabled()) return null;
  return (
    <div className="rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold text-foreground">
          <Presentation className="size-4 text-primary" aria-hidden="true" />
          Conference Demo Mode
        </span>
        <div className="flex items-center gap-2">
          <Badge tone="success">review-first</Badge>
          <Link href={`/${locale}/demo`} className="font-semibold text-primary hover:underline">
            Open walkthrough
          </Link>
        </div>
      </div>
    </div>
  );
}
