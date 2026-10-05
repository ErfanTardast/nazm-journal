"use client";

import Link from "next/link";
import { Calculator, ClipboardCheck, FileCheck2, Upload } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";

const copy = {
  en: { title: "Quick actions", importTrades: "Import MT5 trades", newPlan: "New plan", risk: "Risk calculator", review: "Weekly review" },
  fa: { title: "دسترسی سریع", importTrades: "ورود معاملات MT5", newPlan: "پلن جدید", risk: "ماشین‌حساب ریسک", review: "مرور هفتگی" }
} as const;

/** Four ways into the loop (import, plan, size, review), as links of the phone's touch size. */
export function QuickActions({ locale }: { locale: Locale }) {
  const c = copy[locale];
  const actions: { href: string; label: string; icon: LucideIcon }[] = [
    { href: `/${locale}/import`, label: c.importTrades, icon: Upload },
    { href: `/${locale}/plans`, label: c.newPlan, icon: ClipboardCheck },
    { href: `/${locale}/risk`, label: c.risk, icon: Calculator },
    { href: `/${locale}/reviews`, label: c.review, icon: FileCheck2 }
  ];

  return (
    <section aria-labelledby="dashboard-quick" className="space-y-3">
      <h2 id="dashboard-quick" className="text-lg font-semibold text-foreground">
        {c.title}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex min-h-11 min-w-0 items-center gap-3 rounded-lg border border-border bg-muted/20 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            {label}
          </Link>
        ))}
      </div>
    </section>
  );
}
