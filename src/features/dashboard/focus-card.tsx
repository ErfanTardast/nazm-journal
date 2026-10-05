"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { WeekFocus } from "@/lib/calculations/week-focus";
import { formatCount, formatR } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";

/*
 * The week's focus describes what was measured and invites a review. It never says what to do next: no "should",
 * no "stop", no size advice, no prediction (see the product rules in AGENTS.md).
 */
const copy = {
  en: {
    title: "This week's focus",
    sample: "Sample data",
    empty: "No repeated pattern this week",
    emptyBody: "Nothing in the last 7 days reached the thresholds below. Trades marked rule broken, repeated mistake tags and quick re-entries appear here when they do.",
    rules:
      "Last 7 days, days in your time zone. A pattern appears when a mistake tag is on 2 or more trades, a trade is marked rule broken, or you re-enter within 30 minutes after a loss 2 or more times. The one with the most negative total R is shown.",
    mistake: (label: string, n: string) => `${label}: ${n} times this week`,
    ruleBreaks: (n: string, count: number) => `Marked “rule broken”: ${n} ${count === 1 ? "trade" : "trades"} this week`,
    reentry: (n: string) => `Re-entry within 30 minutes after a loss: ${n} times this week`,
    total: (r: string) => `, ${r} in total.`,
    withoutR: (n: string) => `${n} of these have no R (no stop loss) and are left out of the total.`,
    invite: "Review these trades in the journal.",
    journal: "Review in the journal",
    coach: (name: string) => `Open ${name}`
  },
  fa: {
    title: "تمرکز این هفته",
    sample: "داده نمونه",
    empty: "این هفته الگوی تکراری‌ای دیده نشد",
    emptyBody: "در ۷ روز اخیر چیزی به آستانه‌های زیر نرسید. معامله‌های دارای وضعیت «شکسته شد»، برچسب‌های خطای تکراری و ورودهای دوباره‌ی سریع، هر وقت پیش بیایند اینجا نشان داده می‌شوند.",
    rules:
      "۷ روز اخیر، روزها به وقت منطقه‌ی زمانی شما. وقتی یک برچسب خطا روی ۲ معامله یا بیشتر باشد، معامله‌ای با وضعیت «شکسته شد» ثبت شود، یا ۲ بار یا بیشتر تا ۳۰ دقیقه پس از یک ضرر دوباره وارد شوید، الگو نشان داده می‌شود. الگویی که جمع R منفی‌تری دارد نمایش داده می‌شود.",
    mistake: (label: string, n: string) => `${label}: ${n} بار در این هفته`,
    ruleBreaks: (n: string) => `معامله‌های دارای وضعیت «شکسته شد»: ${n} مورد در این هفته`,
    reentry: (n: string) => `ورود دوباره تا ۳۰ دقیقه پس از یک ضرر: ${n} بار در این هفته`,
    total: (r: string) => `، جمعاً ${r}.`,
    withoutR: (n: string) => `${n} مورد از این‌ها R ندارد (بدون حد ضرر) و در جمع نیامده است.`,
    invite: "این معامله‌ها را در ژورنال مرور کنید.",
    journal: "مرور در ژورنال",
    coach: (name: string) => `باز کردن ${name}`
  }
} as const;

/** The finding as one sentence in the page language: what was measured, how often, the total R, and an invitation to review. */
export function focusSentence(focus: WeekFocus, locale: Locale): string {
  const c = copy[locale];
  const n = formatCount(focus.count, locale);
  const lead = focus.kind === "mistake" ? c.mistake(focus.label ?? "", n) : focus.kind === "rule_breaks" ? c.ruleBreaks(n, focus.count) : c.reentry(n);
  return `${lead}${c.total(formatR(focus.totalR, locale, 1))} ${c.invite}`;
}

export function FocusCard({ focus, locale, coachName, sample }: { focus: WeekFocus | null; locale: Locale; coachName: string; sample: boolean }) {
  const c = copy[locale];
  const linkClass = "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

  return (
    <section aria-labelledby="dashboard-focus" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="dashboard-focus" className="text-lg font-semibold text-foreground">
          {c.title}
        </h2>
        {sample ? <Badge tone="warning">{c.sample}</Badge> : null}
      </div>
      <div className="min-w-0 rounded-lg border border-border bg-muted/20 p-4">
        {focus ? (
          <div className="space-y-3">
            <p className="text-base leading-7 text-foreground" data-testid="week-focus">
              {focusSentence(focus, locale)}
            </p>
            {focus.withoutR > 0 ? <p className="text-xs leading-5 text-muted-foreground">{c.withoutR(formatCount(focus.withoutR, locale))}</p> : null}
            <div className="flex flex-wrap gap-3">
              <Link href={`/${locale}/journal`} className={linkClass}>
                {c.journal}
              </Link>
              <Link href={`/${locale}/ai`} className={linkClass}>
                {c.coach(coachName)}
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-base font-semibold text-foreground">{c.empty}</p>
            <p className="text-sm leading-6 text-muted-foreground">{c.emptyBody}</p>
          </div>
        )}
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{c.rules}</p>
      </div>
    </section>
  );
}
