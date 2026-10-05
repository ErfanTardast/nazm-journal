"use client";

import { useEffect, useState } from "react";
import { Flame, Trophy, CalendarCheck2, AlertTriangle } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { formatCount, formatPercent } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

type DisciplineStreak = {
  currentStreak: number;
  bestStreak: number;
  totalActiveDays: number;
  totalDisciplinedDays: number;
  lastActiveDate: string | null;
  brokeStreakOnLastDay: boolean;
  /** Trading days left out because a trade has no rule verdict yet. */
  unreviewedDays?: number;
};

const copy = {
  en: {
    title: "Discipline streak",
    dayStreak: "day streak",
    daysStreak: "day streak",
    best: "Best",
    disciplinedDays: "Disciplined days",
    empty: "No trading days yet. The streak starts with your first rule-following day.",
    broke: "The last active day broke the streak. One clean, rule-following session restarts it today.",
    note: "Counted over active trading days only — a day without trades never breaks a streak.",
    unreviewed: (days: number, shown: string) =>
      `${shown} trading day${days === 1 ? " has" : "s have"} trades without a rule verdict, so ${days === 1 ? "it is" : "they are"} not counted. Mark each trade followed or broken in the journal.`
  },
  fa: {
    title: "زنجیره انضباط",
    dayStreak: "روز متوالی",
    daysStreak: "روز متوالی",
    best: "بهترین",
    disciplinedDays: "روزهای منضبط",
    empty: "هنوز روز معاملاتی ثبت نشده است. زنجیره با اولین روزِ پایبند به قوانین شروع می‌شود.",
    broke: "آخرین روز فعال، زنجیره را شکست. یک جلسه تمیز و طبق قوانین، امروز آن را دوباره شروع می‌کند.",
    note: "فقط روزهای معاملاتی فعال شمرده می‌شوند — روز بدون معامله هرگز زنجیره را نمی‌شکند.",
    unreviewed: (_days: number, shown: string) =>
      `${shown} روز معاملاتی معامله‌هایی بدون وضعیت قانون دارد و شمرده نمی‌شود. در ژورنال برای هر معامله مشخص کنید قانون رعایت شده یا شکسته.`
  }
} as const;

/** Read-only discipline-streak card for the dashboard. Fetches GET /api/discipline/streak and
 * degrades to nothing if the fetch fails (never blocks the command center). */
export function DisciplineStreakPanel({ locale }: { locale: Locale }) {
  const c = copy[locale];
  const [streak, setStreak] = useState<DisciplineStreak | null>(null);

  useEffect(() => {
    // On failure streak simply stays null -> the panel renders nothing (never blocks the dashboard).
    apiFetch<DisciplineStreak>("/api/discipline/streak")
      .then(setStreak)
      .catch(() => undefined);
  }, []);

  if (!streak) return null;

  const hasHistory = streak.totalActiveDays > 0;
  const unreviewedDays = streak.unreviewedDays ?? 0;
  const disciplinedShare = hasHistory ? Math.round((streak.totalDisciplinedDays / streak.totalActiveDays) * 100) / 100 : 0;
  const count = (value: number) => formatCount(value, locale);
  const flameActive = streak.currentStreak > 0;

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4" data-testid="discipline-streak-panel">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid size-12 shrink-0 place-items-center rounded-full border-2",
              flameActive ? "border-warning/50 bg-warning/10 text-warning" : "border-border text-muted-foreground"
            )}
          >
            <Flame className="size-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{c.title}</p>
            <p className="text-2xl font-bold text-foreground">
              {count(streak.currentStreak)}
              <span className="ms-2 text-sm font-medium text-muted-foreground">{c.dayStreak}</span>
            </p>
          </div>
        </div>

        {hasHistory ? (
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Trophy className="size-4 text-warning" aria-hidden="true" />
              {c.best}: <span className="font-semibold text-foreground">{count(streak.bestStreak)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <CalendarCheck2 className="size-4 text-success" aria-hidden="true" />
              {c.disciplinedDays}:{" "}
              <span dir="ltr" className="font-semibold text-foreground">
                {`${count(streak.totalDisciplinedDays)}/${count(streak.totalActiveDays)} (${formatPercent(disciplinedShare, locale)})`}
              </span>
            </span>
          </div>
        ) : null}
      </div>

      {unreviewedDays > 0 ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{c.unreviewed(unreviewedDays, count(unreviewedDays))}</p> : null}
      {!hasHistory ? (
        unreviewedDays > 0 ? null : <p className="mt-3 text-sm leading-6 text-muted-foreground">{c.empty}</p>
      ) : streak.brokeStreakOnLastDay ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-sm text-foreground">{c.broke}</p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">{c.note}</p>
      )}
    </div>
  );
}
