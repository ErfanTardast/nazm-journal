"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarCheck2, CircleCheck, Focus, ShieldCheck, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PremiumPanel } from "@/components/ui/premium-panel";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Sparkline } from "@/components/ui/sparkline";
import { StatCard } from "@/components/ui/stat-card";
import { AuthRequiredState, ErrorState, LoadingState } from "@/components/ui/state";
import { apiFetch, isAuthError } from "@/lib/api/client";
import { apiErrorText } from "@/lib/api/error-text";
import { formatMoney, formatPercent } from "@/lib/i18n/format";
import { t, type getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";

type Messages = ReturnType<typeof getMessages>;
type Trade = {
  id: string;
  symbol: string;
  market: string;
  realizedPnl: number | null;
  rMultiple: number | null;
  ruleFollowed: "followed" | "broken" | "mixed" | "unknown";
  openedAt: string;
  journalEntry?: { mistakes?: string[]; emotionalState?: string | null; lessonsLearned?: string | null } | null;
};
type Metrics = {
  totalTrades: number;
  winRate: number;
  netPnl: number;
  averageR: number;
  expectancy: number;
  maxDrawdownAmount: number;
  equityCurve: number[];
};
type Review = {
  id: string;
  status: "open" | "completed" | "skipped";
  type: string;
  title: string;
  periodStart: string;
};
type Strategy = {
  id: string;
  name: string;
  checklist: string[];
  commonMistakes: string[];
};

/** A count written in Persian digits, so a sentence never mixes them with the Persian "۱۰" next to it. */
const persianCount = (count: number) => new Intl.NumberFormat("fa-IR").format(count);

const copy = {
  en: {
    eyebrow: "Growth OS",
    description: "Track how the trader is improving across reviews, rules, mistakes, strategy consistency, and emotional discipline.",
    focus: "Current focus area",
    changed: "What changed since last month?",
    next: "What to focus on next week",
    timeline: "Growth timeline",
    discipline: "Rule-following trend",
    mistake: "Repeated mistake pressure",
    mastery: "Strategy mastery",
    coach: "Local coaching summary",
    loading: "Loading growth OS",
    unavailable: "Growth unavailable",
    loadFailed: "Growth data failed to load.",
    stats: { trades: "Journaled trades", netPnl: "Net P&L", averageR: "Average R", ruleDiscipline: "Rule discipline" },
    progressTitle: "Long-term progress",
    progressBody: "Equity, review completion, and discipline are treated as evidence for self-review, not as outcome promises.",
    reviewCompletion: "Review completion",
    trend: "Equity trend",
    milestones: {
      firstTenTitle: "First 10 journaled trades",
      firstTenDetail: (count: number) => `${count}/10 journaled trades`,
      firstWeekTitle: "First full review week",
      firstWeekDetail: (count: number) => `${count} weekly reviews completed`,
      reducedTitle: "Reduced repeated mistake",
      reducedNone: "No repeated mistake pressure yet"
    },
    none: "None",
    playbooks: (count: number) => `${count} active playbooks`,
    analysis: {
      reduce: (mistake: string) => `Reduce "${mistake}" before adding new complexity.`,
      collect: "Keep collecting clean journal evidence.",
      ruleTheme: "Make rule discipline the next review theme.",
      ruleKeep: "Protect the current rule discipline baseline.",
      reviewsDone: (count: number) => `${count} reviews have been completed.`,
      playbooksAvailable: (count: number) => `${count} strategy playbooks are available for review.`,
      noPlaybooks: "No strategy playbooks are active yet.",
      prevent: (mistake: string) => `Write one prevention rule for ${mistake}.`,
      weekly: "Complete one weekly review.",
      measurable: "Keep one measurable focus area visible in daily reviews.",
      summaryEmpty:
        "Start with a small number of high-quality journal records. Growth tracking becomes useful once behavior, mistakes, and rules are recorded consistently.",
      summary: (theme: string) => `Current evidence points to ${theme} as the next review theme. Keep the next focus narrow and measurable.`,
      ruleDisciplineTheme: "rule discipline",
      quoted: (mistake: string) => `"${mistake}"`
    }
  },
  fa: {
    eyebrow: "سیستم رشد",
    description: "بهبود معامله‌گر را در مرورها، قوانین، خطاها، ثبات استراتژی و انضباط احساسی دنبال کنید.",
    focus: "تمرکز فعلی",
    changed: "چه چیزی نسبت به ماه قبل تغییر کرد؟",
    next: "تمرکز هفته بعد",
    timeline: "خط زمان رشد",
    discipline: "روند پایبندی به قوانین",
    mistake: "فشار خطاهای تکراری",
    mastery: "تسلط بر استراتژی",
    coach: "خلاصه مربی محلی",
    loading: "در حال بارگذاری سیستم رشد",
    unavailable: "سیستم رشد در دسترس نیست",
    loadFailed: "بارگذاری داده‌های رشد ممکن نشد.",
    stats: { trades: "معاملات ثبت‌شده در ژورنال", netPnl: "سود و زیان خالص", averageR: "میانگین R", ruleDiscipline: "انضباط قوانین" },
    progressTitle: "پیشرفت بلندمدت",
    progressBody: "منحنی سرمایه، تکمیل مرورها و انضباط شواهدی برای مرور شخصی هستند، نه وعده نتیجه.",
    reviewCompletion: "تکمیل مرورها",
    trend: "روند سرمایه",
    milestones: {
      firstTenTitle: "۱۰ معامله اول در ژورنال",
      firstTenDetail: (count: number) => `${persianCount(count)} از ۱۰ معامله ثبت شده`,
      firstWeekTitle: "اولین هفته کامل مرور",
      firstWeekDetail: (count: number) => `${persianCount(count)} مرور هفتگی تکمیل شده`,
      reducedTitle: "کاهش خطای تکراری",
      reducedNone: "هنوز فشار خطای تکراری وجود ندارد"
    },
    none: "ندارد",
    playbooks: (count: number) => `${persianCount(count)} پلی‌بوک فعال`,
    analysis: {
      reduce: (mistake: string) => `پیش از افزودن پیچیدگی جدید، «${mistake}» را کاهش دهید.`,
      collect: "به جمع‌آوری شواهد دقیق در ژورنال ادامه دهید.",
      ruleTheme: "انضباط قوانین را موضوع مرور بعدی کنید.",
      ruleKeep: "سطح فعلی انضباط قوانین را حفظ کنید.",
      reviewsDone: (count: number) => `${persianCount(count)} مرور تکمیل شده است.`,
      playbooksAvailable: (count: number) => `${persianCount(count)} پلی‌بوک استراتژی برای مرور موجود است.`,
      noPlaybooks: "هنوز پلی‌بوک فعالی وجود ندارد.",
      prevent: (mistake: string) => `برای «${mistake}» یک قانون پیشگیری بنویسید.`,
      weekly: "یک مرور هفتگی را تکمیل کنید.",
      measurable: "یک محور تمرکز قابل‌اندازه‌گیری را در مرورهای روزانه جلوی چشم نگه دارید.",
      summaryEmpty:
        "با تعداد کمی رکورد باکیفیت در ژورنال شروع کنید. وقتی رفتار، خطاها و قوانین به‌طور منظم ثبت شوند، ردیابی رشد مفید می‌شود.",
      summary: (theme: string) => `شواهد فعلی نشان می‌دهد موضوع مرور بعدی باید ${theme} باشد. تمرکز بعدی را محدود و قابل‌اندازه‌گیری نگه دارید.`,
      ruleDisciplineTheme: "انضباط قوانین",
      quoted: (mistake: string) => `«${mistake}»`
    }
  }
} as const;

type AnalysisCopy = (typeof copy)["en"]["analysis"] | (typeof copy)["fa"]["analysis"];

export function GrowthScreen({ locale, messages }: { locale: Locale; messages: Messages }) {
  const c = copy[locale];
  const numberLocale = locale === "fa" ? "fa-IR" : "en-US";
  const number = new Intl.NumberFormat(numberLocale);
  const twoDecimals = new Intl.NumberFormat(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [trades, setTrades] = useState<Trade[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<{ trades: Trade[] }>("/api/trades"),
      apiFetch<{ metrics: Metrics }>("/api/trades/metrics"),
      apiFetch<{ reviews: Review[] }>("/api/reviews"),
      apiFetch<{ strategies: Strategy[] }>("/api/strategies")
    ])
      .then(([tradeData, metricData, reviewData, strategyData]) => {
        setTrades(tradeData.trades);
        setMetrics(metricData.metrics);
        setReviews(reviewData.reviews);
        setStrategies(strategyData.strategies);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  const analysis = useMemo(() => buildGrowthAnalysis(trades, reviews, strategies, c.analysis), [reviews, strategies, trades, c]);

  if (loading) return <LoadingState label={c.loading} />;
  if (error) {
    if (isAuthError(error)) return <AuthRequiredState locale={locale} />;
    return <ErrorState title={c.unavailable} description={apiErrorText(error, locale, c.loadFailed)} />;
  }
  if (!metrics) return null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={c.eyebrow} title={t(messages, "pages.growth")} description={c.description} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label={c.stats.trades} value={number.format(metrics.totalTrades)} compact />
        <StatCard label={c.stats.netPnl} value={formatMoney(metrics.netPnl, locale)} tone={metrics.netPnl >= 0 ? "success" : "danger"} compact />
        <StatCard label={c.stats.averageR} value={twoDecimals.format(metrics.averageR)} compact />
        <StatCard label={c.stats.ruleDiscipline} value={formatPercent(analysis.ruleFollowRate, locale)} tone={analysis.ruleFollowRate >= 0.75 ? "success" : "warning"} compact />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_390px]">
        <PremiumPanel glow className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">{c.timeline}</p>
              <h2 className="mt-2 text-xl font-semibold">{c.progressTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{c.progressBody}</p>
            </div>
            <ProgressRing value={analysis.reviewCompletionRate} label={c.reviewCompletion} />
          </div>
          <div className="mt-6">
            <Sparkline values={metrics.equityCurve.length ? metrics.equityCurve : [0, metrics.netPnl]} label={c.trend} />
          </div>
        </PremiumPanel>

        <PremiumPanel className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{c.coach}</p>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">{analysis.coachingSummary}</p>
        </PremiumPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Insight title={c.focus} icon={Focus} items={analysis.focusAreas} />
        <Insight title={c.changed} icon={TrendingUp} items={analysis.changed} />
        <Insight title={c.next} icon={CalendarCheck2} items={analysis.nextWeek} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Milestone title={c.milestones.firstTenTitle} complete={metrics.totalTrades >= 10} detail={c.milestones.firstTenDetail(Math.min(metrics.totalTrades, 10))} />
        <Milestone title={c.milestones.firstWeekTitle} complete={analysis.completedWeeklyReviews > 0} detail={c.milestones.firstWeekDetail(analysis.completedWeeklyReviews)} />
        <Milestone title={c.milestones.reducedTitle} complete={analysis.topMistakes.length <= 1 && trades.length > 0} detail={analysis.topMistakes[0] ?? c.milestones.reducedNone} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <MetricPanel title={c.discipline} value={formatPercent(analysis.ruleFollowRate, locale)} />
        <MetricPanel title={c.mistake} value={analysis.topMistakes[0] ?? c.none} />
        <MetricPanel title={c.mastery} value={c.playbooks(strategies.length)} />
      </div>
    </div>
  );
}

function buildGrowthAnalysis(trades: Trade[], reviews: Review[], strategies: Strategy[], a: AnalysisCopy) {
  const ruleRelevant = trades.filter((trade) => trade.ruleFollowed !== "unknown");
  const ruleFollowRate = ruleRelevant.length ? ruleRelevant.filter((trade) => trade.ruleFollowed === "followed").length / ruleRelevant.length : 0;
  const completedReviews = reviews.filter((review) => review.status === "completed").length;
  const reviewCompletionRate = reviews.length ? completedReviews / reviews.length : 0;
  const topMistakes = topValues(trades.flatMap((trade) => trade.journalEntry?.mistakes ?? []), 3);
  const completedWeeklyReviews = reviews.filter((review) => review.status === "completed" && review.type === "weekly").length;
  const focusAreas = [
    topMistakes[0] ? a.reduce(topMistakes[0]) : a.collect,
    ruleFollowRate < 0.75 ? a.ruleTheme : a.ruleKeep
  ];
  const changed = [
    a.reviewsDone(completedReviews),
    strategies.length ? a.playbooksAvailable(strategies.length) : a.noPlaybooks
  ];
  const nextWeek = [
    topMistakes[0] ? a.prevent(topMistakes[0]) : a.weekly,
    a.measurable
  ];

  return {
    ruleFollowRate,
    reviewCompletionRate,
    topMistakes,
    completedWeeklyReviews,
    focusAreas,
    changed,
    nextWeek,
    coachingSummary: trades.length === 0 ? a.summaryEmpty : a.summary(topMistakes[0] ? a.quoted(topMistakes[0]) : a.ruleDisciplineTheme)
  };
}

function topValues(values: string[], limit: number) {
  const counts = values.filter(Boolean).reduce<Map<string, number>>((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map());
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([value]) => value);
}

function Insight({ title, icon: Icon, items }: { title: string; icon: typeof Focus; items: string[] }) {
  return (
    <PremiumPanel className="p-5">
      <Icon className="size-5 text-primary" aria-hidden="true" />
      <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </PremiumPanel>
  );
}

function Milestone({ title, complete, detail }: { title: string; complete: boolean; detail: string }) {
  return (
    <PremiumPanel className="p-5">
      <CircleCheck className={`size-5 ${complete ? "text-success" : "text-muted-foreground"}`} aria-hidden="true" />
      <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
    </PremiumPanel>
  );
}

function MetricPanel({ title, value }: { title: string; value: string }) {
  return (
    <PremiumPanel className="p-5">
      <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
      <p className="mt-4 text-sm text-muted-foreground">{title}</p>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
    </PremiumPanel>
  );
}
