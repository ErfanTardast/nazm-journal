"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  ListChecks,
  Play,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  StopCircle,
  Target,
  XCircle
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { PremiumPanel } from "@/components/ui/premium-panel";
import { ProgressRing } from "@/components/ui/progress-ring";
import { SectionPanel } from "@/components/ui/section-panel";
import { AuthRequiredState, ErrorState, LoadingState } from "@/components/ui/state";
import { DisciplineStreakPanel } from "@/features/dashboard/discipline-streak-panel";
import { FocusCard } from "@/features/dashboard/focus-card";
import type { DashboardOverview, ReadinessAction } from "@/features/dashboard/overview-types";
import { PerformanceSection } from "@/features/dashboard/performance-tiles";
import { QuickActions } from "@/features/dashboard/quick-actions";
import { RecentTrades } from "@/features/dashboard/recent-trades";
import { TodaySection } from "@/features/dashboard/today-tiles";
import { SetupChecklist } from "@/features/onboarding/setup-checklist";
import { SampleDataOffer } from "@/features/sample/sample-data-offer";
import { apiFetch, isAuthError } from "@/lib/api/client";
import { apiErrorText } from "@/lib/api/error-text";
import { formatCount, formatNumber, formatPercent } from "@/lib/i18n/format";
import { t, type getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

type Messages = ReturnType<typeof getMessages>;

type DisciplineOverview = {
  /** null while there is nothing to grade yet (no trades): show the empty state, never a default grade. */
  disciplineScore: {
    score: number;
    grade: string;
    checks: { key: string; score: number; passed: boolean; detail: string }[];
  } | null;
  propGuard: {
    alerts: { key: string; severity: "danger" | "warning"; message: string }[];
    isBlocked: boolean;
    todayLossPct: number;
    maxDailyLossPct: number;
  };
  mistakePatterns: { mistake: string; frequency: number; streak: number; avgRImpact: number | null }[];
};

const copy = {
  en: {
    eyebrow: "Discipline command center",
    title: "Am I ready to trade today?",
    description: "Readiness is based on your written plan, risk defaults, journal follow-ups, review status, and recent rule discipline.",
    loading: "Checking today's discipline readiness",
    unavailable: "Readiness is unavailable",
    loadFailed: "The dashboard could not be loaded. Reload the page or try again in a moment.",
    statuses: {
      ready: "Ready to follow the plan",
      caution: "Review before proceeding",
      not_ready: "Not ready yet"
    },
    statusDescriptions: {
      ready: "All five discipline checks are clear. Follow the written plan and keep risk unchanged.",
      caution: "One or two checks need attention. Resolve the highest-priority item before adding a new record.",
      not_ready: "Several discipline checks are incomplete. Use the primary action to restore the workflow."
    },
    score: "Readiness score",
    primaryAction: "Next required action",
    checksTitle: "Today's readiness checks",
    checksDescription: "These checks describe process readiness, not market opportunity.",
    checks: {
      plan: "One complete written plan",
      risk: "Risk defaults are valid",
      review: "No overdue review",
      rules: "No recent rule break",
      journal: "No journal follow-up due"
    },
    actionLabels: {
      review: "Complete review",
      risk: "Fix risk defaults",
      plan: "Create complete plan",
      journal: "Finish journal follow-up",
      ready: "Open today's plan"
    },
    markets: { crypto: "Crypto", forex: "Forex", stocks: "Stocks" } as Record<string, string>,
    session: {
      title: "Trading Session",
      noSession: "No active session",
      noSessionDesc: "Start a session before you trade to activate discipline tracking.",
      start: "Start session",
      starting: "Starting...",
      complete: "Complete session",
      abandon: "Abandon",
      stopping: "Stopping...",
      active: "Session active",
      mistakeAlert: "Watch out for",
      quickJournal: "Quick journal",
      market: "Market",
      label: "Session window",
      labelPlaceholder: "e.g. London open",
      mistakeToAvoid: "One mistake to avoid today",
      mistakePlaceholder: "e.g. FOMO after a loss",
      emotionalState: "Emotional state",
      emotionalStatePlaceholder: "e.g. Calm and focused",
      startedAt: "Started",
      cancel: "Cancel",
      elapsedMinutes: "{m}m",
      elapsedHours: "{h}h {m}m",
      startFailed: "The session could not be started. Check the fields and try again.",
      stopFailed: "The session could not be updated. Try again in a moment.",
      labelRequired: "Enter the session window, for example London open.",
      refreshFailed: "The change was saved, but the page could not refresh. Reload the page to see it."
    }
  },
  fa: {
    eyebrow: "مرکز فرمان انضباط",
    title: "آیا امروز برای معامله آماده‌ام؟",
    description: "آمادگی بر اساس پلن مکتوب، پیش‌فرض‌های ریسک، پیگیری ژورنال، وضعیت مرور و پایبندی اخیر به قوانین سنجیده می‌شود.",
    loading: "در حال بررسی آمادگی انضباطی امروز",
    unavailable: "وضعیت آمادگی در دسترس نیست",
    loadFailed: "بارگذاری داشبورد ممکن نشد. صفحه را دوباره باز کنید یا چند لحظه بعد تلاش کنید.",
    statuses: {
      ready: "آماده اجرای پلن",
      caution: "پیش از ادامه مرور کنید",
      not_ready: "هنوز آماده نیستید"
    },
    statusDescriptions: {
      ready: "هر پنج بررسی انضباطی روشن است. طبق پلن مکتوب پیش بروید و ریسک را تغییر ندهید.",
      caution: "یک یا دو مورد نیاز به توجه دارد. پیش از ثبت رکورد جدید، مهم‌ترین مورد را تکمیل کنید.",
      not_ready: "چند بررسی انضباطی ناقص است. با اقدام اصلی، چرخه کاری را دوباره منظم کنید."
    },
    score: "امتیاز آمادگی",
    primaryAction: "اقدام ضروری بعدی",
    checksTitle: "بررسی‌های آمادگی امروز",
    checksDescription: "این موارد آمادگی فرایندی را نشان می‌دهند، نه فرصت بازار را.",
    checks: {
      plan: "یک پلن مکتوب کامل",
      risk: "پیش‌فرض‌های ریسک معتبر",
      review: "بدون مرور عقب‌افتاده",
      rules: "بدون نقض قانون اخیر",
      journal: "بدون پیگیری ناقص ژورنال"
    },
    actionLabels: {
      review: "تکمیل مرور",
      risk: "اصلاح پیش‌فرض ریسک",
      plan: "ساخت پلن کامل",
      journal: "تکمیل پیگیری ژورنال",
      ready: "باز کردن پلن امروز"
    },
    markets: { crypto: "کریپتو", forex: "فارکس", stocks: "سهام" } as Record<string, string>,
    session: {
      title: "جلسه معاملاتی",
      noSession: "جلسه فعالی نیست",
      noSessionDesc: "قبل از معامله یک جلسه شروع کنید تا ردیابی انضباط فعال شود.",
      start: "شروع جلسه",
      starting: "در حال شروع...",
      complete: "پایان جلسه",
      abandon: "رها کردن",
      stopping: "در حال توقف...",
      active: "جلسه فعال",
      mistakeAlert: "مراقب باش",
      quickJournal: "ژورنال سریع",
      market: "بازار",
      label: "بازه زمانی",
      labelPlaceholder: "مثلاً: باز شدن لندن",
      mistakeToAvoid: "یک خطا که باید امروز از آن اجتناب کنم",
      mistakePlaceholder: "مثلاً: فومو بعد از ضرر",
      emotionalState: "وضعیت احساسی",
      emotionalStatePlaceholder: "مثلاً: آرام و متمرکز",
      startedAt: "شروع",
      cancel: "انصراف",
      elapsedMinutes: "{m} دقیقه",
      elapsedHours: "{h} ساعت و {m} دقیقه",
      startFailed: "شروع جلسه ممکن نشد. فیلدها را بررسی کنید و دوباره تلاش کنید.",
      stopFailed: "به‌روزرسانی جلسه ممکن نشد. چند لحظه بعد دوباره تلاش کنید.",
      labelRequired: "بازه زمانی جلسه را وارد کنید، مثلاً باز شدن لندن.",
      refreshFailed: "تغییر ذخیره شد، اما صفحه به‌روز نشد. برای دیدن آن صفحه را دوباره باز کنید."
    }
  }
} as const;

/**
 * Persian wording for the trading guards' sentences: the server's own Persian sentences, with the glossary word پلن for a plan.
 * The page uses these for every guard it knows, whichever language the server wrote the sentence in (an older server writes
 * English, and a server build may still say برنامه for a plan); only the numbers are taken from the server's text.
 */
const propGuardFa: Record<string, (n: string[]) => string> = {
  daily_loss_limit: ([loss, max]) => `به سقف ضرر روزانه رسیده‌اید: ${loss}٪ از حداکثر ${max}٪.`,
  daily_loss_warning: ([loss, max]) => `به سقف ضرر روزانه نزدیک می‌شوید: ${loss}٪ از حداکثر ${max}٪.`,
  overtrading: ([count, limit]) => `امروز ${count} معامله ثبت شده است (سقف جلسه: ${limit}).`,
  revenge_pattern: () => "دو ضرر پیاپی. پیش از ورود بعدی پلن را مرور کنید.",
  unplanned_trades: ([count]) => `${count} معامله امروز بدون پلن مکتوب یا پلی‌بوک ثبت شده است.`
};

/** A number in the server's text, in Latin or Persian digits, with "." or "٫" as the decimal mark. */
const GUARD_NUMBER = /[\d۰-۹]+(?:[.٫][\d۰-۹]+)?/g;

function propGuardMessage(alert: { key: string; message: string }, locale: Locale) {
  const text = propGuardFa[alert.key];
  if (locale !== "fa" || !text) return alert.message;
  // Persian digits and decimal mark, keeping the decimals exactly as the server wrote them.
  const persian = (value: string) => value.replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]).replace(".", "٫");
  return text((alert.message.match(GUARD_NUMBER) ?? []).map(persian));
}

function formatElapsed(minutes: number, c: { elapsedMinutes: string; elapsedHours: string }, locale: Locale) {
  if (minutes < 60) return c.elapsedMinutes.replace("{m}", formatCount(minutes, locale));
  return c.elapsedHours.replace("{h}", formatCount(Math.floor(minutes / 60), locale)).replace("{m}", formatCount(minutes % 60, locale));
}

const actionConfig: Record<ReadinessAction, { href: string; icon: LucideIcon }> = {
  review: { href: "reviews", icon: FileCheck2 },
  risk: { href: "settings", icon: ShieldAlert },
  plan: { href: "plans", icon: ClipboardCheck },
  journal: { href: "journal", icon: ListChecks },
  ready: { href: "plans", icon: Target }
};

/**
 * The home screen, in the order a trader asks: what should I do today (readiness, then today's loss meter, plan and
 * reviews), how am I doing (the last 30 days), what is my biggest problem this week (the focus card), then the latest
 * trades and quick actions. The session, discipline panels and the five readiness checks sit lower down. Every block
 * comes in the one overview request; a block whose data is missing (an older payload) is left out.
 */
export function DashboardScreen({ locale, messages }: { locale: Locale; messages: Messages }) {
  const c = copy[locale];
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [discipline, setDiscipline] = useState<DisciplineOverview | null>(null);
  const [showStartForm, setShowStartForm] = useState(false);
  const [startingSess, setStartingSess] = useState(false);
  const [stoppingSess, setStoppingSess] = useState(false);
  // The last failed session start/stop, shown inside the session panel (the trader keeps the form and retries).
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionForm, setSessionForm] = useState({
    market: "crypto",
    sessionLabel: "",
    mistakeToAvoid: "",
    emotionalState: ""
  });
  const overviewUrl = `/api/dashboard/overview?locale=${locale}`;
  const sessionFieldLabels: Record<string, string> = {
    market: c.session.market,
    sessionLabel: c.session.label,
    mistakeToAvoid: c.session.mistakeToAvoid,
    emotionalState: c.session.emotionalState
  };

  useEffect(() => {
    // The server writes the alerts and review titles in the language it is asked for; ask for the page's own.
    apiFetch<DashboardOverview>(overviewUrl).then(setData).catch(setError);
    apiFetch<DisciplineOverview>(`/api/discipline?locale=${locale}`).then(setDiscipline).catch(() => undefined);
  }, [locale, overviewUrl]);

  /** Reload the overview after a session change; a failed reload is reported too, never swallowed. */
  async function refreshOverview() {
    try {
      setData(await apiFetch<DashboardOverview>(overviewUrl));
      return true;
    } catch (err) {
      if (isAuthError(err)) setError(err);
      else setSessionError(c.session.refreshFailed);
      return false;
    }
  }

  async function handleStartSession(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionForm.sessionLabel.trim()) {
      setSessionError(c.session.labelRequired);
      return;
    }
    setStartingSess(true);
    setSessionError(null);
    try {
      await apiFetch("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          market: sessionForm.market,
          sessionLabel: sessionForm.sessionLabel.trim(),
          mistakeToAvoid: sessionForm.mistakeToAvoid.trim() || null,
          emotionalState: sessionForm.emotionalState.trim() || null
        })
      });
    } catch (err) {
      if (isAuthError(err)) setError(err);
      else setSessionError(apiErrorText(err, locale, c.session.startFailed, sessionFieldLabels));
      setStartingSess(false);
      return;
    }
    if (await refreshOverview()) setShowStartForm(false);
    setStartingSess(false);
  }

  async function handleStopSession(sessionId: string, status: "completed" | "abandoned") {
    setStoppingSess(true);
    setSessionError(null);
    try {
      await apiFetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
    } catch (err) {
      if (isAuthError(err)) setError(err);
      else setSessionError(apiErrorText(err, locale, c.session.stopFailed));
      setStoppingSess(false);
      return;
    }
    await refreshOverview();
    setStoppingSess(false);
  }

  if (error) {
    if (isAuthError(error)) return <AuthRequiredState locale={locale} />;
    return <ErrorState title={c.unavailable} description={apiErrorText(error, locale, c.loadFailed)} />;
  }
  if (!data) return <LoadingState label={c.loading} />;

  const action = actionConfig[data.readiness.primaryAction];
  const ActionIcon = action.icon;
  const statusTone = data.readiness.status === "ready" ? "success" : data.readiness.status === "caution" ? "warning" : "danger";
  const timeZone = data.performance?.context.timeZone ?? "UTC";
  const sample = data.performance?.context.source === "sample";

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={c.eyebrow} title={c.title} description={c.description} />

      {/* Each shows itself only when it has something to say: setup steps still open, sample data an empty journal can load. */}
      <SetupChecklist locale={locale} />
      <SampleDataOffer locale={locale} />

      <PremiumPanel glow>
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <Badge tone={statusTone}>{c.statuses[data.readiness.status]}</Badge>
            <h2 className="mt-4 text-2xl font-semibold text-foreground sm:text-3xl">{c.statusDescriptions[data.readiness.status]}</h2>
            <p className="mt-3 text-sm font-semibold text-muted-foreground">{c.primaryAction}</p>
            <Link
              href={`/${locale}/${action.href}`}
              className="mt-3 inline-flex min-h-12 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ActionIcon className="me-2 size-5" aria-hidden="true" />
              {c.actionLabels[data.readiness.primaryAction]}
              <ArrowRight className="ms-3 size-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
          </div>
          <div className="flex items-center gap-4 lg:flex-col">
            <ProgressRing value={data.readiness.score / 100} label={c.score} className="size-28" locale={locale} />
            <span className="text-xs font-semibold text-muted-foreground">{c.score}</span>
          </div>
        </div>
      </PremiumPanel>

      {/* The loss meter, the plan and the reviews waiting. The review tile reads reviewTasks, or reviewFocus in an older payload. */}
      <TodaySection data={data} locale={locale} />

      {data.performance ? <PerformanceSection snapshot={data.performance} locale={locale} /> : null}

      {data.focus !== undefined ? <FocusCard focus={data.focus} locale={locale} coachName={t(messages, "nav.ai")} sample={sample} /> : null}

      {data.recentTrades ? <RecentTrades trades={data.recentTrades} timeZone={timeZone} sample={sample} locale={locale} /> : null}

      <QuickActions locale={locale} />

      <SessionPanel
        locale={locale}
        c={c.session}
        activeSession={data.activeSession}
        showStartForm={showStartForm}
        sessionForm={sessionForm}
        startingSess={startingSess}
        stoppingSess={stoppingSess}
        error={sessionError}
        marketNames={c.markets}
        onToggleForm={() => {
          setSessionError(null);
          setShowStartForm((v) => !v);
        }}
        onFormChange={(field, value) => setSessionForm((prev) => ({ ...prev, [field]: value }))}
        onStartSession={handleStartSession}
        onStopSession={handleStopSession}
      />

      {discipline ? <DisciplinePanel discipline={discipline} locale={locale} /> : null}

      <DisciplineStreakPanel locale={locale} />

      <SectionPanel title={c.checksTitle} description={c.checksDescription}>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {data.readiness.checks.map((check) => (
            <div
              key={check.key}
              className={cn(
                "flex min-h-20 min-w-0 items-start gap-3 rounded-md border p-3",
                check.passed ? "border-success/25 bg-success/10" : "border-warning/30 bg-warning/10"
              )}
            >
              {check.passed ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
              ) : (
                <XCircle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
              )}
              <div>
                <p className="text-sm font-semibold text-foreground">{c.checks[check.key]}</p>
                {!check.passed && check.count > 0 ? <p className="mt-1 text-xs text-muted-foreground">{formatCount(check.count, locale)}</p> : null}
              </div>
            </div>
          ))}
        </div>
      </SectionPanel>
    </div>
  );
}

const disciplineCheckLabels: Record<Locale, Record<string, string>> = {
  en: { plan_adherence: "Plans", rule_discipline: "Rules", journal_completeness: "Journal", mistake_control: "Mistakes", review_consistency: "Reviews" },
  fa: { plan_adherence: "پلن‌ها", rule_discipline: "قوانین", journal_completeness: "ژورنال", mistake_control: "خطاها", review_consistency: "مرورها" }
};

export function DisciplinePanel({ discipline, locale }: { discipline: DisciplineOverview; locale: Locale }) {
  const { disciplineScore, propGuard, mistakePatterns } = discipline;
  const gradeColor = !disciplineScore
    ? "text-muted-foreground"
    : disciplineScore.grade === "A" || disciplineScore.grade === "B"
      ? "text-success"
      : disciplineScore.grade === "C"
        ? "text-warning"
        : "text-destructive";

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        {disciplineScore ? (
          <div className="flex items-center gap-4">
            <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-full border-2 border-border">
              <span className={cn("text-xl font-bold", gradeColor)}>{disciplineScore.grade}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {locale === "fa" ? "امتیاز انضباط هفتگی" : "Weekly discipline score"}
              </p>
              <p className="text-2xl font-bold text-foreground">{formatCount(disciplineScore.score, locale)}</p>
              <p className="text-xs text-muted-foreground">{locale === "fa" ? "از ۱۰۰" : "out of 100"}</p>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm font-semibold text-foreground">
              {locale === "fa" ? "امتیاز انضباط هفتگی" : "Weekly discipline score"}
            </p>
            <p className="mt-1 text-base font-semibold text-muted-foreground">
              {locale === "fa" ? "هنوز داده کافی نیست" : "Not enough data yet"}
            </p>
            <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">
              {locale === "fa"
                ? "اولین معامله خود را در ژورنال ثبت کنید تا امتیاز انضباط هفتگی اینجا نمایش داده شود."
                : "Log your first trade in the journal and your weekly discipline score will appear here."}
            </p>
          </div>
        )}

        {disciplineScore ? (
          <div className="flex flex-wrap gap-2">
            {disciplineScore.checks.map((check) => (
              <div
                key={check.key}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs font-medium",
                  check.passed ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning"
                )}
              >
                {`${disciplineCheckLabels[locale][check.key] ?? check.key} ${formatPercent(Math.round(check.score) / 100, locale)}`}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {propGuard.alerts.length > 0 && (
        <div className="mt-4 space-y-2">
          {propGuard.alerts.map((alert) => (
            <div
              key={alert.key}
              className={cn(
                "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
                alert.severity === "danger"
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-warning/30 bg-warning/10 text-foreground"
              )}
            >
              {alert.severity === "danger" ? (
                <ShieldX className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
              ) : (
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              )}
              {propGuardMessage(alert, locale)}
            </div>
          ))}
        </div>
      )}

      {propGuard.alerts.length === 0 && (
        <p className="mt-3 flex items-center gap-2 text-xs text-success">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          {locale === "fa" ? "همه محافظ‌های معاملاتی روشن هستند." : "All trading guards are clear."}
        </p>
      )}

      {mistakePatterns.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">
            {locale === "fa" ? "الگوهای خطای اخیر" : "Recent mistake patterns"}
          </p>
          <div className="space-y-1.5">
            {mistakePatterns.slice(0, 3).map((p) => (
              <div key={p.mistake} className="flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-foreground">{p.mistake}</span>
                <span className="shrink-0 text-muted-foreground">
                  {formatCount(p.frequency, locale)}× · {locale === "fa" ? "پیاپی: " : "streak: "}
                  {formatCount(p.streak, locale)}/{formatCount(5, locale)}
                  {p.avgRImpact !== null ? ` · ${locale === "fa" ? "میانگین R" : "avg R"} ${formatNumber(p.avgRImpact, locale, { min: 2, max: 2 })}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type SessionCopy = { [K in keyof (typeof copy)["en"]["session"]]: string };
type SessionFormState = { market: string; sessionLabel: string; mistakeToAvoid: string; emotionalState: string };

function SessionPanel({
  locale,
  c,
  activeSession,
  showStartForm,
  sessionForm,
  startingSess,
  stoppingSess,
  error,
  marketNames,
  onToggleForm,
  onFormChange,
  onStartSession,
  onStopSession
}: {
  locale: Locale;
  c: SessionCopy;
  activeSession: DashboardOverview["activeSession"];
  showStartForm: boolean;
  sessionForm: SessionFormState;
  startingSess: boolean;
  stoppingSess: boolean;
  error: string | null;
  marketNames: Record<string, string>;
  onToggleForm: () => void;
  onFormChange: (field: keyof SessionFormState, value: string) => void;
  onStartSession: (e: React.FormEvent) => void;
  onStopSession: (id: string, status: "completed" | "abandoned") => void;
}) {
  if (activeSession) {
    const elapsed = Math.round((Date.now() - new Date(activeSession.startedAt).getTime()) / 60_000);
    const elapsedLabel = formatElapsed(elapsed, c, locale);

    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
            </span>
            <span className="text-sm font-semibold text-primary">{c.active}</span>
            <span className="text-xs text-muted-foreground">
              {marketNames[activeSession.market] ?? activeSession.market} · {activeSession.sessionLabel} · {elapsedLabel}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/${locale}/journal`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-primary/10 px-3 text-sm font-semibold text-primary transition hover:bg-primary/20"
            >
              <Target className="size-4" aria-hidden="true" />
              {c.quickJournal}
            </Link>
            <button
              onClick={() => onStopSession(activeSession.id, "completed")}
              disabled={stoppingSess}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-success/10 px-3 text-sm font-semibold text-success transition hover:bg-success/20 disabled:opacity-60"
            >
              <StopCircle className="size-4" aria-hidden="true" />
              {stoppingSess ? c.stopping : c.complete}
            </button>
            <button
              onClick={() => onStopSession(activeSession.id, "abandoned")}
              disabled={stoppingSess}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-60"
            >
              {c.abandon}
            </button>
          </div>
        </div>
        {activeSession.mistakeToAvoid ? (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-sm text-foreground">
              <span className="font-semibold text-warning">{c.mistakeAlert}: </span>
              {activeSession.mistakeToAvoid}
            </p>
          </div>
        ) : null}
        <SessionError message={error} />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{c.noSession}</p>
          {!showStartForm && <p className="mt-0.5 text-xs text-muted-foreground">{c.noSessionDesc}</p>}
        </div>
        {!showStartForm && (
          <button
            onClick={onToggleForm}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
          >
            <Play className="size-4" aria-hidden="true" />
            {c.start}
          </button>
        )}
      </div>

      {showStartForm && (
        <form onSubmit={onStartSession} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">{c.market}</label>
            <select
              value={sessionForm.market}
              onChange={(e) => onFormChange("market", e.target.value)}
              className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="crypto">{marketNames.crypto}</option>
              <option value="forex">{marketNames.forex}</option>
              <option value="stocks">{marketNames.stocks}</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">{c.label} *</label>
            <input
              required
              type="text"
              value={sessionForm.sessionLabel}
              onChange={(e) => onFormChange("sessionLabel", e.target.value)}
              placeholder={c.labelPlaceholder}
              className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">{c.mistakeToAvoid}</label>
            <input
              type="text"
              value={sessionForm.mistakeToAvoid}
              onChange={(e) => onFormChange("mistakeToAvoid", e.target.value)}
              placeholder={c.mistakePlaceholder}
              className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">{c.emotionalState}</label>
            <input
              type="text"
              value={sessionForm.emotionalState}
              onChange={(e) => onFormChange("emotionalState", e.target.value)}
              placeholder={c.emotionalStatePlaceholder}
              className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <SessionError message={error} className="sm:col-span-2" />
          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={startingSess}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
            >
              <Play className="size-4" aria-hidden="true" />
              {startingSess ? c.starting : c.start}
            </button>
            <button
              type="button"
              onClick={onToggleForm}
              className="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              {c.cancel}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** The reason a session could not be started or updated, right where the trader pressed the button. */
function SessionError({ message, className = "" }: { message: string | null; className?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={`mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive ${className}`}>
      {message}
    </p>
  );
}
