"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { AnalyticsBreakdown } from "@/components/ui/charts/analytics-breakdown";
import { MiniBars } from "@/components/ui/charts/mini-bars";
import { SectionPanel } from "@/components/ui/section-panel";
import { StatCard } from "@/components/ui/stat-card";
import { AuthRequiredState, EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { SampleDataOffer } from "@/features/sample/sample-data-offer";
import { apiFetch, isAuthError } from "@/lib/api/client";
import { apiErrorText } from "@/lib/api/error-text";
import { summarizeBy } from "@/lib/calculations/analytics";
import { formatMoney, formatPercent } from "@/lib/i18n/format";
import { t, type getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";

type Messages = ReturnType<typeof getMessages>;
type Trade = {
  symbol: string;
  market: string;
  side: string;
  session?: string | null;
  setupType?: string | null;
  emotionalState?: string | null;
  realizedPnl?: number | null;
  rMultiple?: number | null;
  strategy?: { name: string } | null;
  journalEntry?: { mistakes: string[]; emotionalState: string | null; ruleFollowed?: string } | null;
};
type Metrics = {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  netPnl: number;
  averageR: number;
  profitFactor: number;
  expectancy: number;
  /** Deepest fall of the journal's cumulative P&L (money) and cumulative R from their peaks. */
  maxDrawdownAmount: number;
  maxDrawdownR: number;
  /** Share of the highest balance, when the starting balance is set in Settings. */
  maxDrawdownPct?: number | null;
  equityCurve: number[];
  /** Ladder legs of one entry counted once (see calculateJournalMetrics). */
  setups?: {
    count: number;
    combined: number;
    pendingLegs: number;
    wins: number;
    losses: number;
    winRate: number;
    averageR: number;
    expectancy: number;
  };
};

const copy = {
  en: {
    eyebrow: "Review, not prediction",
    description: "Review behavior, repeated mistakes, rule discipline, and playbook quality. This page does not predict future outcomes.",
    equity: "Equity curve",
    equityDesc: "Cumulative realized journal results across closed trades.",
    prompts: "Weekly review prompts",
    promptsDesc: "Use these questions before changing any strategy rule.",
    market: "Performance by market",
    symbol: "Performance by symbol",
    strategy: "Performance by strategy",
    setup: "Performance by setup",
    session: "Performance by session",
    mistake: "Mistake analysis",
    emotion: "Emotion analysis",
    distribution: "P&L distribution",
    breakdownDesc: "Net result is reviewed behavior, not a forecast.",
    metricTrades: "Trades",
    metricWinRate: "Win rate",
    metricAvgR: "Avg R",
    breakdownEmpty: "Add more journal entries to populate this review.",
    statWinRate: "Win rate",
    statExpectancy: "Expectancy",
    statAverageR: "Average R",
    statDrawdown: "Drawdown",
    wins: "wins",
    losses: "losses",
    winRateNote: "Wins and losses count the result after commission and swap. The MT5 report counts before commission, so its win rate can be higher.",
    entries: "By entry (ladder legs combined)",
    entriesDesc: "Legs of one entry split across a take-profit ladder count once, and only after every leg is closed.",
    statEntries: "Entries",
    statEntryWinRate: "Entry win rate",
    statEntryAverageR: "Entry average R",
    statEntryExpectancy: "Entry expectancy",
    pendingLegs: (count: number) =>
      `${count} closed position${count === 1 ? "" : "s"} belong${count === 1 ? "s" : ""} to entries whose other legs are still open or not imported yet; they are left out of these entry numbers until the entry is complete.`,
    promptsItems: [
      "Which rule was broken most often?",
      "Which setup had the cleanest plan adherence?",
      "What risk behavior should be reduced next week?",
      "What is one checklist item to improve?"
    ],
    distributionDesc: "Simple visual distribution of recent outcomes.",
    distributionEmpty: "Not enough journal data yet.",
    loading: "Loading performance review",
    emptyTitle: "Not enough data yet",
    emptyDescription: "After you import trades, your win rate, expectancy, drawdown and strategy results appear here.",
    emptyImport: "Import MT5 trades",
    emptyJournal: "Log a trade in the journal",
    unavailableTitle: "Performance unavailable",
    unavailableDescription: "Performance data failed to load",
    chartEmpty: "Add closed journal trades to draw the equity curve.",
    chartDescription: (count: number, last: string) => `${count} closed journal results ending at ${last}.`,
    unspecified: "Unspecified",
    markets: { crypto: "Crypto", forex: "Forex", stocks: "Global Stocks" } as Record<string, string>
  },
  fa: {
    eyebrow: "مرور، نه پیش‌بینی",
    description: "رفتار، خطاهای تکراری، انضباط قوانین و کیفیت پلی‌بوک را مرور کنید. این صفحه آینده بازار را پیش‌بینی نمی‌کند.",
    equity: "منحنی سرمایه",
    equityDesc: "نتایج تجمعی معاملات بسته‌شده در ژورنال.",
    prompts: "پرسش‌های مرور هفتگی",
    promptsDesc: "قبل از تغییر قوانین استراتژی، این پرسش‌ها را بررسی کنید.",
    market: "عملکرد بر اساس بازار",
    symbol: "عملکرد بر اساس نماد",
    strategy: "عملکرد بر اساس استراتژی",
    setup: "عملکرد بر اساس ستاپ",
    session: "عملکرد بر اساس سشن",
    mistake: "تحلیل خطاها",
    emotion: "تحلیل احساسات",
    distribution: "توزیع سود و زیان",
    breakdownDesc: "نتیجه خالص، مرور رفتار است نه پیش‌بینی.",
    metricTrades: "معاملات",
    metricWinRate: "نرخ برد",
    metricAvgR: "میانگین R",
    breakdownEmpty: "برای تکمیل این مرور، ورودی‌های ژورنال بیشتری اضافه کنید.",
    statWinRate: "نرخ برد",
    statExpectancy: "امید ریاضی",
    statAverageR: "میانگین R",
    statDrawdown: "افت سرمایه",
    wins: "برد",
    losses: "باخت",
    winRateNote: "برد و باخت بر اساس نتیجه‌ی بعد از کمیسیون و سواپ شمرده می‌شود. گزارش MT5 قبل از کمیسیون می‌شمارد، برای همین نرخ برد آن می‌تواند بالاتر باشد.",
    entries: "بر اساس ورود (پله‌های یک ورود با هم)",
    entriesDesc: "پله‌های یک ورود که روی چند حد سود پخش شده‌اند یک بار شمرده می‌شوند، و فقط وقتی همه‌ی پله‌ها بسته شده باشند.",
    statEntries: "ورودها",
    statEntryWinRate: "نرخ برد ورودها",
    statEntryAverageR: "میانگین R ورودها",
    statEntryExpectancy: "امید ریاضی ورودها",
    pendingLegs: (count: number) =>
      `${count} پوزیشن بسته متعلق به ورودهایی است که بقیه‌ی پله‌هایشان هنوز باز است یا هنوز وارد نشده؛ تا کامل شدن ورود، در این اعداد حساب نمی‌شوند.`,
    promptsItems: [
      "کدام قانون بیشتر از بقیه نقض شد؟",
      "کدام ستاپ پایبندی شفاف‌تری به پلن داشت؟",
      "کدام رفتار ریسکی باید در هفته بعد کاهش پیدا کند؟",
      "یک مورد چک‌لیست برای بهبود چیست؟"
    ],
    distributionDesc: "نمای ساده‌ای از نتیجه معاملات اخیر برای مرور رفتار.",
    distributionEmpty: "هنوز داده کافی در ژورنال وجود ندارد.",
    loading: "در حال بارگذاری مرور عملکرد",
    emptyTitle: "هنوز داده کافی نیست",
    emptyDescription: "بعد از ورود معاملات، نرخ برد، امید ریاضی، افت سرمایه و عملکرد استراتژی‌های شما اینجا نمایش داده می‌شود.",
    emptyImport: "ورود معاملات MT5",
    emptyJournal: "ثبت معامله در ژورنال",
    unavailableTitle: "عملکرد در دسترس نیست",
    unavailableDescription: "بارگذاری داده‌های عملکرد ناموفق بود",
    chartEmpty: "برای نمایش منحنی سرمایه، چند معامله بسته‌شده اضافه کنید.",
    chartDescription: (count: number, last: string) => `${count} نتیجه بسته‌شده در ژورنال که به ${last} می‌رسد.`,
    unspecified: "نامشخص",
    markets: { crypto: "کریپتو", forex: "فارکس", stocks: "سهام جهانی" } as Record<string, string>
  }
} as const;

type EquityPoint = {
  trade: number;
  equity: number;
};

function EquityCurveChart({
  data,
  locale,
  label,
  emptyLabel,
  describe
}: {
  data: EquityPoint[];
  locale: Locale;
  label: string;
  emptyLabel: string;
  describe: (count: number, last: string) => string;
}) {
  if (data.length < 2) {
    return (
      <div className="flex h-72 min-h-72 items-center justify-center rounded-md border border-dashed border-border bg-background/30 px-6 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  const width = 720;
  const height = 280;
  const padding = { top: 20, right: 26, bottom: 34, left: 78 };
  const rawMin = Math.min(...data.map((point) => point.equity));
  const rawMax = Math.max(...data.map((point) => point.equity));
  const spread = rawMax - rawMin || Math.max(Math.abs(rawMax), 1);
  const min = rawMin === rawMax ? rawMin - spread * 0.5 : rawMin;
  const max = rawMin === rawMax ? rawMax + spread * 0.5 : rawMax;
  const range = max - min || 1;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const points = data.map((point, index) => {
    const x = padding.left + (index / (data.length - 1)) * plotWidth;
    const y = padding.top + (1 - (point.equity - min) / range) * plotHeight;
    return { ...point, x, y };
  });
  const polyline = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const ticks = [max, min + range / 2, min];
  const zeroY = min < 0 && max > 0 ? padding.top + (1 - (0 - min) / range) * plotHeight : null;
  const last = data[data.length - 1]?.equity ?? 0;
  const lastPoint = points[points.length - 1];

  return (
    <div className="h-72 min-h-72 w-full min-w-0 overflow-hidden rounded-md border border-border/70 bg-background/30 p-3">
      <svg className="h-full w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: ${formatMoney(last, locale)}`}>
        <title>{label}</title>
        <desc>{describe(data.length, formatMoney(last, locale))}</desc>
        <rect x="0" y="0" width={width} height={height} rx="10" fill="transparent" />
        {ticks.map((tick) => {
          const y = padding.top + (1 - (tick - min) / range) * plotHeight;
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="hsl(var(--border))" strokeDasharray="4 7" />
              <text x={padding.left - 12} y={y + 4} textAnchor="end" fontSize="12" fill="hsl(var(--muted-foreground))">
                {formatMoney(tick, locale)}
              </text>
            </g>
          );
        })}
        {zeroY !== null ? (
          <line x1={padding.left} x2={width - padding.right} y1={zeroY} y2={zeroY} stroke="hsl(var(--muted-foreground))" strokeOpacity="0.55" />
        ) : null}
        <polyline points={polyline} fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {lastPoint ? <circle cx={lastPoint.x} cy={lastPoint.y} r="5" fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth="3" /> : null}
        <text x={padding.left} y={height - 8} fontSize="12" fill="hsl(var(--muted-foreground))">
          #{data[0]?.trade}
        </text>
        <text x={width - padding.right} y={height - 8} textAnchor="end" fontSize="12" fill="hsl(var(--muted-foreground))">
          #{data[data.length - 1]?.trade}
        </text>
      </svg>
    </div>
  );
}

export function PerformanceScreen({ locale, messages }: { locale: Locale; messages: Messages }) {
  const c = copy[locale];
  const [trades, setTrades] = useState<Trade[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([apiFetch<{ trades: Trade[] }>("/api/trades"), apiFetch<{ metrics: Metrics }>("/api/trades/metrics")])
      .then(([tradeData, metricData]) => {
        setTrades(tradeData.trades);
        setMetrics(metricData.metrics);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const none = c.unspecified;
    return {
      market: summarizeBy(trades, (trade) => trade.market, none).map((row) => ({ ...row, key: c.markets[row.key] ?? row.key })),
      symbol: summarizeBy(trades, (trade) => trade.symbol, none),
      strategy: summarizeBy(trades, (trade) => trade.strategy?.name, none),
      setup: summarizeBy(trades, (trade) => trade.setupType, none),
      session: summarizeBy(trades, (trade) => trade.session, none),
      mistake: summarizeBy(
        trades.flatMap((trade) => (trade.journalEntry?.mistakes ?? []).map((mistake) => ({ ...trade, mistake }))),
        (trade) => trade.mistake,
        none
      ),
      emotion: summarizeBy(trades, (trade) => trade.journalEntry?.emotionalState ?? trade.emotionalState, none)
    };
  }, [trades, c]);

  const breakdownLabels = useMemo(
    () => ({ trades: c.metricTrades, winRate: c.metricWinRate, avgR: c.metricAvgR, empty: c.breakdownEmpty }),
    [c]
  );

  if (loading) return <LoadingState label={c.loading} />;
  if (error) {
    if (isAuthError(error)) return <AuthRequiredState locale={locale} />;
    return <ErrorState title={c.unavailableTitle} description={apiErrorText(error, locale, c.unavailableDescription)} />;
  }
  if (!metrics) return null;
  if (metrics.totalTrades === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={c.eyebrow} title={t(messages, "pages.performance")} description={c.description} />
        <EmptyState
          title={c.emptyTitle}
          description={c.emptyDescription}
          actions={[
            { href: `/${locale}/import`, label: c.emptyImport },
            { href: `/${locale}/journal`, label: c.emptyJournal }
          ]}
        />
        <SampleDataOffer locale={locale} />
      </div>
    );
  }

  const equityData = metrics.equityCurve.map((equity, index) => ({ trade: index + 1, equity }));

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={c.eyebrow} title={t(messages, "pages.performance")} description={c.description} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label={c.statWinRate} value={formatPercent(metrics.winRate, locale)} detail={`${metrics.wins} ${c.wins} / ${metrics.losses} ${c.losses}`} />
        <StatCard label={c.statExpectancy} value={formatMoney(metrics.expectancy, locale)} />
        <StatCard label={c.statAverageR} value={metrics.averageR.toFixed(2)} />
        <StatCard
          label={c.statDrawdown}
          value={formatMoney(metrics.maxDrawdownAmount, locale)}
          detail={
            metrics.maxDrawdownPct === null || metrics.maxDrawdownPct === undefined
              ? `${metrics.maxDrawdownR.toFixed(1)}R`
              : `${metrics.maxDrawdownR.toFixed(1)}R · ${formatPercent(metrics.maxDrawdownPct, locale)}`
          }
          tone="warning"
        />
      </div>
      <p className="text-xs text-muted-foreground">{c.winRateNote}</p>

      {metrics.setups && (metrics.setups.combined > 0 || metrics.setups.pendingLegs > 0) ? (
        <SectionPanel title={c.entries} description={c.entriesDesc}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label={c.statEntries} value={String(metrics.setups.count)} compact />
            <StatCard
              label={c.statEntryWinRate}
              value={formatPercent(metrics.setups.winRate, locale)}
              detail={`${metrics.setups.wins} ${c.wins} / ${metrics.setups.losses} ${c.losses}`}
              compact
            />
            <StatCard label={c.statEntryAverageR} value={metrics.setups.averageR.toFixed(2)} compact />
            <StatCard label={c.statEntryExpectancy} value={formatMoney(metrics.setups.expectancy, locale)} compact />
          </div>
          {metrics.setups.pendingLegs > 0 ? <p className="mt-3 text-xs text-muted-foreground">{c.pendingLegs(metrics.setups.pendingLegs)}</p> : null}
        </SectionPanel>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <SectionPanel title={c.equity} description={c.equityDesc}>
          <EquityCurveChart data={equityData} locale={locale} label={c.equity} emptyLabel={c.chartEmpty} describe={c.chartDescription} />
        </SectionPanel>
        <SectionPanel title={c.prompts} description={c.promptsDesc}>
          <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
            {c.promptsItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </SectionPanel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AnalyticsBreakdown title={c.strategy} description={c.breakdownDesc} rows={grouped.strategy} locale={locale} labels={breakdownLabels} />
        <AnalyticsBreakdown title={c.setup} description={c.breakdownDesc} rows={grouped.setup} locale={locale} labels={breakdownLabels} />
        <AnalyticsBreakdown title={c.session} description={c.breakdownDesc} rows={grouped.session} locale={locale} labels={breakdownLabels} />
        <AnalyticsBreakdown title={c.market} description={c.breakdownDesc} rows={grouped.market} locale={locale} labels={breakdownLabels} />
        <AnalyticsBreakdown title={c.symbol} description={c.breakdownDesc} rows={grouped.symbol} locale={locale} labels={breakdownLabels} />
        <AnalyticsBreakdown title={c.mistake} description={c.breakdownDesc} rows={grouped.mistake} locale={locale} labels={breakdownLabels} />
        <AnalyticsBreakdown title={c.emotion} description={c.breakdownDesc} rows={grouped.emotion} locale={locale} labels={breakdownLabels} />
        <SectionPanel title={c.distribution} description={c.distributionDesc}>
          <MiniBars values={trades.map((trade) => Number(trade.realizedPnl ?? 0)).slice(-12)} tone="primary" emptyLabel={c.distributionEmpty} />
        </SectionPanel>
      </div>
    </div>
  );
}
