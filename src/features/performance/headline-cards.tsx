"use client";

import { SectionPanel } from "@/components/ui/section-panel";
import { StatCard } from "@/components/ui/stat-card";
import type { PerformanceSummary, PeriodKey } from "@/lib/calculations/performance/types";
import { formatCount, formatMoney, formatNumber, formatPercent, formatR, formatSignedMoney } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";

const DASH = "—";

const copy = {
  en: {
    period: { "7d": "Closed trades: last 7 days", "30d": "Closed trades: last 30 days", "90d": "Closed trades: last 90 days", all: "Closed trades: all time" } as Record<PeriodKey, string>,
    netPnl: "Net P&L",
    winRate: "Win rate",
    profitFactor: "Profit factor",
    expectancy: "Expectancy",
    averageR: "Average R",
    drawdown: "Max drawdown",
    netPnlNote: (n: string) => `${n} closed trades in this period, after fees`,
    winRateNote: (wins: string, losses: string, even: string, n: string) => `${wins} wins, ${losses} losses and ${even} breakeven out of ${n} closed trades`,
    winRateNone: "No closed trade in this period",
    profitFactorNote: (profit: string, loss: string) => `Gross profit ${profit} divided by gross loss ${loss}`,
    profitFactorNoLosses: "No losing trade in this period",
    profitFactorNoResults: "No profit or loss to compare in this period",
    expectancyNote: (n: string) => `Average result per closed trade so far, over ${n} trades with a money value`,
    expectancyNone: "No closed trade with a money value in this period",
    averageRNote: (n: string) => `Average result in R over the ${n} closed trades that have an R`,
    averageRNone: "No closed trade with an R (a stop loss) in this period",
    drawdownNote: (r: string) => `Deepest fall from a high of the curve in this period (${r})`,
    drawdownShare: (share: string) => `, ${share} of the balance at that high`,
    winRateFootnote: "Wins and losses count the result after commission and swap. The MT5 report counts before commission, so its win rate can be higher.",
    entries: "By entry (ladder legs combined)",
    entriesDesc: "Legs of one entry split across a take-profit ladder count once, and only after every leg is closed.",
    statEntries: "Entries",
    statEntryWinRate: "Entry win rate",
    statEntryAverageR: "Entry average R",
    statEntryExpectancy: "Entry expectancy",
    entryWins: (wins: string, losses: string) => `${wins} wins / ${losses} losses`,
    pendingLegs: (n: string, count: number) =>
      `${n} closed ${count === 1 ? "position belongs" : "positions belong"} to entries whose other legs are still open or not imported yet; they are left out of these entry numbers until the entry is complete.`
  },
  fa: {
    period: { "7d": "معاملات بسته: ۷ روز اخیر", "30d": "معاملات بسته: ۳۰ روز اخیر", "90d": "معاملات بسته: ۹۰ روز اخیر", all: "معاملات بسته: همه‌ی زمان‌ها" } as Record<PeriodKey, string>,
    netPnl: "سود و زیان خالص",
    winRate: "نرخ برد",
    profitFactor: "ضریب سود",
    expectancy: "امید ریاضی",
    averageR: "میانگین R",
    drawdown: "بیشترین افت سرمایه",
    netPnlNote: (n: string) => `${n} معامله‌ی بسته در این بازه، پس از کسر کارمزد`,
    winRateNote: (wins: string, losses: string, even: string, n: string) => `${wins} برد، ${losses} باخت و ${even} سربه‌سر از ${n} معامله‌ی بسته`,
    winRateNone: "در این بازه معامله‌ی بسته‌ای نیست",
    profitFactorNote: (profit: string, loss: string) => `سود ناخالص ${profit} تقسیم بر زیان ناخالص ${loss}`,
    profitFactorNoLosses: "در این بازه معامله‌ی زیان‌ده‌ای نیست",
    profitFactorNoResults: "در این بازه سود یا زیانی برای مقایسه نیست",
    expectancyNote: (n: string) => `میانگین نتیجه‌ی هر معامله‌ی بسته تا امروز، روی ${n} معامله‌ی دارای ارزش پولی`,
    expectancyNone: "در این بازه معامله‌ی بسته‌ی دارای ارزش پولی نیست",
    averageRNote: (n: string) => `میانگین نتیجه بر حسب R روی ${n} معامله‌ی بسته‌ای که R دارند`,
    averageRNone: "در این بازه معامله‌ی بسته‌ی دارای R (حد ضرر) نیست",
    drawdownNote: (r: string) => `عمیق‌ترین افت از یک اوج منحنی در این بازه (${r})`,
    drawdownShare: (share: string) => `، ${share} از موجودی در همان اوج`,
    winRateFootnote: "برد و باخت بر اساس نتیجه‌ی بعد از کمیسیون و سواپ شمرده می‌شود. گزارش MT5 قبل از کمیسیون می‌شمارد، برای همین نرخ برد آن می‌تواند بالاتر باشد.",
    entries: "بر اساس ورود (پله‌های یک ورود با هم)",
    entriesDesc: "پله‌های یک ورود که روی چند حد سود پخش شده‌اند یک بار شمرده می‌شوند، و فقط وقتی همه‌ی پله‌ها بسته شده باشند.",
    statEntries: "ورودها",
    statEntryWinRate: "نرخ برد ورودها",
    statEntryAverageR: "میانگین R ورودها",
    statEntryExpectancy: "امید ریاضی ورودها",
    entryWins: (wins: string, losses: string) => `${wins} برد / ${losses} باخت`,
    pendingLegs: (n: string) =>
      `${n} پوزیشن بسته متعلق به ورودهایی است که بقیه‌ی پله‌هایشان هنوز باز است یا هنوز وارد نشده؛ تا کامل شدن ورود، در این اعداد حساب نمی‌شوند.`
  }
} as const;

const toneOf = (value: number): "success" | "danger" | "default" => (value > 0 ? "success" : value < 0 ? "danger" : "default");

/** The six numbers every review starts from, each with its label and one line on what it counts (definitions: performance/types.ts). */
export function HeadlineCards({ summary, period, locale }: { summary: PerformanceSummary; period: PeriodKey; locale: Locale }) {
  const c = copy[locale];
  const count = (value: number) => formatCount(value, locale);
  const priced = summary.closedTrades - summary.unpricedClosed;
  const withR = summary.closedTrades - summary.withoutR;

  const profitFactor =
    summary.profitFactorState === "value" && summary.profitFactor !== null
      ? { value: formatNumber(summary.profitFactor, locale, { min: 2, max: 2 }), note: c.profitFactorNote(formatMoney(summary.grossProfit, locale), formatMoney(summary.grossLoss, locale)) }
      : { value: DASH, note: summary.profitFactorState === "no_losses" ? c.profitFactorNoLosses : c.profitFactorNoResults };

  const drawdownNote =
    c.drawdownNote(formatR(summary.maxDrawdownR, locale, 1)) +
    (summary.maxDrawdownPct === null ? "" : c.drawdownShare(formatPercent(summary.maxDrawdownPct, locale)));

  const cards = [
    {
      id: "net-pnl",
      label: c.netPnl,
      value: formatSignedMoney(summary.netPnl, locale),
      note: c.netPnlNote(count(summary.closedTrades)),
      tone: toneOf(summary.netPnl)
    },
    {
      id: "win-rate",
      label: c.winRate,
      value: summary.winRate === null ? DASH : formatPercent(summary.winRate, locale),
      note:
        summary.closedTrades === 0
          ? c.winRateNone
          : c.winRateNote(count(summary.wins), count(summary.losses), count(summary.breakeven), count(summary.closedTrades)),
      tone: "default" as const
    },
    { id: "profit-factor", label: c.profitFactor, ...profitFactor, tone: "default" as const },
    {
      id: "expectancy",
      label: c.expectancy,
      value: summary.expectancy === null ? DASH : formatSignedMoney(summary.expectancy, locale),
      note: summary.expectancy === null ? c.expectancyNone : c.expectancyNote(count(priced)),
      tone: "default" as const
    },
    {
      id: "average-r",
      label: c.averageR,
      value: summary.averageR === null ? DASH : formatR(summary.averageR, locale),
      note: summary.averageR === null ? c.averageRNone : c.averageRNote(count(withR)),
      tone: "default" as const
    },
    { id: "drawdown", label: c.drawdown, value: formatMoney(summary.maxDrawdownAmount, locale), note: drawdownNote, tone: "warning" as const }
  ];

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">{c.period[period]}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <div key={card.id} data-headline={card.id} className="min-w-0">
            <StatCard label={card.label} value={card.value} detail={card.note} tone={card.tone} />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{c.winRateFootnote}</p>
    </section>
  );
}

/** Ladder entries counted once: shown only when some entry was split into legs, or some legs wait for the rest of their entry. */
export function EntriesBlock({ summary, locale }: { summary: PerformanceSummary; locale: Locale }) {
  const { entries } = summary;
  if (entries.combined === 0 && entries.pendingLegs === 0) return null;
  const c = copy[locale];
  return (
    <SectionPanel title={c.entries} description={c.entriesDesc}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="min-w-0">
          <StatCard label={c.statEntries} value={formatCount(entries.count, locale)} compact />
        </div>
        <div className="min-w-0">
          <StatCard
            label={c.statEntryWinRate}
            value={entries.winRate === null ? DASH : formatPercent(entries.winRate, locale)}
            detail={c.entryWins(formatCount(entries.wins, locale), formatCount(entries.losses, locale))}
            compact
          />
        </div>
        <div className="min-w-0">
          <StatCard label={c.statEntryAverageR} value={entries.averageR === null ? DASH : formatR(entries.averageR, locale)} compact />
        </div>
        <div className="min-w-0">
          <StatCard label={c.statEntryExpectancy} value={entries.expectancy === null ? DASH : formatSignedMoney(entries.expectancy, locale)} compact />
        </div>
      </div>
      {entries.pendingLegs > 0 ? <p className="mt-3 text-xs text-muted-foreground">{c.pendingLegs(formatCount(entries.pendingLegs, locale), entries.pendingLegs)}</p> : null}
    </SectionPanel>
  );
}
