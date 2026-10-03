"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import {
  BookOpenCheck,
  Brain,
  Camera,
  CheckCircle2,
  FileText,
  Filter,
  ImagePlus,
  Lightbulb,
  Link2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UploadCloud,
  X
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MiniBars } from "@/components/ui/charts/mini-bars";
import { DataTable } from "@/components/ui/data-table";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MobileDataList } from "@/components/ui/mobile-data-list";
import { PremiumPanel } from "@/components/ui/premium-panel";
import { ProgressRing } from "@/components/ui/progress-ring";
import { SectionPanel } from "@/components/ui/section-panel";
import { Select } from "@/components/ui/select";
import { Sparkline } from "@/components/ui/sparkline";
import { StatCard } from "@/components/ui/stat-card";
import { AuthRequiredState, EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { SampleDataOffer } from "@/features/sample/sample-data-offer";
import { announceSampleRemoved } from "@/features/sample/sample-workspace-client";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, isAuthError } from "@/lib/api/client";
import { apiErrorText } from "@/lib/api/error-text";
import { estimateDataUrlBytes, fileToCompressedDataUrl, validateImageFile } from "@/lib/attachments/image";
import { entryLegIds } from "@/lib/calculations/ladders";
import { formatMoney, formatPercent } from "@/lib/i18n/format";
import { localDateTimeToIso, toLocalDateTimeValue } from "@/lib/time/local-datetime";
import { TradeReviewEditor } from "./trade-review-editor";
import { t, type getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";
import { splitListInput } from "@/lib/text/split-list";
import { cn } from "@/lib/utils";

type Messages = ReturnType<typeof getMessages>;
type Market = "crypto" | "forex" | "stocks";
type TradeSide = "long" | "short";
type TradeStatus = "open" | "closed" | "planned" | "canceled";
type RuleResult = "followed" | "broken" | "mixed" | "unknown";

type Strategy = {
  id: string;
  name: string;
  checklist?: string[];
  commonMistakes?: string[];
};

type Idea = {
  id: string;
  title: string;
  market: Market;
  symbols: string[];
  status: string;
  confidence: number;
  thesis: string;
};

type Review = {
  id: string;
  type: string;
  title: string;
  status: string;
  linkedTradeIds: string[];
  linkedStrategyIds: string[];
};

type NewsItem = {
  title: string;
  source: string;
  market: Market;
  relatedSymbols: string[];
  importance: string;
  summary: string;
  riskNotes?: string[];
};

type Trade = {
  id: string;
  strategyId?: string | null;
  symbol: string;
  market: Market;
  side: TradeSide;
  status: TradeStatus;
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  quantity: number;
  riskAmount: number | null;
  riskPercent: number | null;
  rMultiple: number | null;
  realizedPnl: number | null;
  fees: number;
  session: string | null;
  setupType: string | null;
  confidenceScore: number | null;
  preTradeNotes: string | null;
  postTradeNotes: string | null;
  lessonsLearned: string | null;
  outcome: string | null;
  ruleFollowed: RuleResult;
  openedAt: string;
  closedAt: string | null;
  /** Legs of one ladder entry share a key (see src/lib/calculations/ladders.ts). */
  ladderKey?: string | null;
  ladderLeg?: number | null;
  strategy?: Strategy | null;
  journalEntry?: {
    emotionalState?: string | null;
    mistakes?: string[];
    tags?: string[];
    notes?: string | null;
    preTradeNotes?: string | null;
    postTradeNotes?: string | null;
    lessonsLearned?: string | null;
    screenshotUrl?: string | null;
  } | null;
};

type Metrics = {
  totalTrades: number;
  winRate: number;
  netPnl: number;
  profitFactor: number;
  expectancy: number;
  averageR: number;
  maxDrawdownAmount: number;
  equityCurve: number[];
};

const copy = {
  en: {
    eyebrow: "Trade journal",
    description:
      "Review the full context of each trade: plan, risk, psychology, rule discipline, mistakes, and the lesson that should change the next session.",
    loading: "Loading journal",
    unavailable: "Journal unavailable",
    loadFailed: "The journal could not be loaded. Reload the page or try again in a moment.",
    createFailed: "Trade could not be created. Try again in a moment.",
    quickFailed: "Could not save the trade. Try again in a moment.",
    stats: { trades: "Trades", winRate: "Win rate", netPnl: "Net P&L", expectancy: "Expectancy", maxDrawdown: "Max drawdown" },
    equityCurve: "Equity curve",
    none: "None",
    // Values the product writes itself when it records a trade (see convertTradePlan); anything a trader typed is shown as typed.
    systemSetups: { "planned-trade-conversion": "From a plan" } as Record<string, string>,
    systemTags: { "converted-plan": "Converted plan" } as Record<string, string>,
    emptyTitle: "No trades yet",
    emptyDescription:
      "Once your trades are in, the journal, stats and equity curve show up here. Import your MT5 history, or add a trade by hand with the form below.",
    emptyImport: "Import MT5 trades",
    importCta: "Import CSV",
    search: "Search symbol, setup, note, mistake",
    filters: "Journal cockpit",
    filtersDesc: "Filter records before reviewing behavior and outcomes.",
    add: "Add reviewed trade",
    addDesc: "Capture the plan, outcome, emotion, and lesson in one structured record.",
    refresh: "Refresh",
    create: "Create trade",
    creating: "Creating...",
    reset: "Reset form",
    table: "Trade log",
    tableDesc: "Recent records with risk, R multiple, rule result, and journal context.",
    selected: "Trade dossier",
    selectedDesc: "A focused review panel for the selected record.",
    noSelection: "Select a trade to review its notes, risks, mistakes, and lessons.",
    discipline: "Rule discipline",
    distribution: "R multiple distribution",
    distributionDesc: "Closed-trade R values. Color is paired with labels for readability.",
    allMarkets: "All markets",
    allStatuses: "All statuses",
    process: "Review timeline",
    before: "Before trade",
    during: "Trade record",
    after: "After trade",
    lessonPrompt: "What did you learn from this trade?",
    lessonHelp: "Write one behavior or rule that should be easier to recognize next time.",
    related: "Related second-brain context",
    relatedEmpty: "No linked ideas, reviews, or news context yet.",
    ideaContext: "Ideas",
    reviewContext: "Reviews",
    newsContext: "News context",
    screenshot: "Screenshot / chart note",
    screenshotEmpty: "No screenshot saved yet.",
    screenshotField: "Chart screenshot",
    screenshotHint: "Attach a chart image (PNG, JPG, WebP, GIF). It is downscaled and stored privately with the record.",
    screenshotUpload: "Upload image",
    screenshotProcessing: "Optimizing...",
    screenshotRemove: "Remove",
    screenshotUrlLabel: "Or paste an image URL",
    screenshotOpen: "Open full image",
    screenshotTooBig: "Image is too large even after optimizing. Try a smaller crop.",
    screenshotBadType: "Unsupported file. Use PNG, JPG, WebP, or GIF.",
    screenshotSourceTooBig: "File is too large. Choose an image under 12 MB.",
    screenshotFailed: "Could not process that image. Try another file.",
    privateNote: "Private review data. This workspace supports analysis and learning only.",
    required: "Required",
    optional: "Optional",
    tradeBasics: "Trade basics",
    riskAndOutcome: "Risk and outcome",
    reviewNotes: "Review notes",
    journalPlaceholder: "Describe what happened and what evidence mattered.",
    autoIfBlank: "Auto if blank",
    commaSeparated: "Comma separated",
    placeholders: {
      session: "e.g. London, New York",
      setup: "e.g. Breakout retest",
      confidence: "1-10",
      riskPercent: "e.g. 1",
      outcome: "e.g. Plan matched",
      emotion: "e.g. Focused",
      tags: "e.g. breakout, review",
      mistakes: "late entry, oversizing",
      preNotes: "What was the plan, and why this setup?",
      postNotes: "How was the trade managed, and why did it end?",
      lesson: "One behavior or rule to recognize next time."
    },
    noClosedData: "No closed-trade R data yet.",
    quickTitle: "Quick entry",
    quickDesc: "Record what happened in under 30 seconds. Fill details later.",
    quickSave: "Quick save",
    quickSaving: "Saving...",
    quickReset: "Clear",
    unplanned: "Unplanned",
    labels: {
      symbol: "Symbol",
      market: "Market",
      side: "Side",
      status: "Status",
      strategy: "Strategy",
      entry: "Entry price",
      exit: "Exit price",
      stop: "Stop loss",
      target: "Take profit",
      quantity: "Quantity",
      riskAmount: "Risk amount",
      riskPercent: "Risk %",
      rMultiple: "R multiple",
      pnl: "P&L",
      fees: "Fees",
      session: "Session",
      setup: "Setup",
      confidence: "Confidence",
      rule: "Rule result",
      emotion: "Emotion",
      outcome: "Outcome",
      opened: "Opened at",
      closed: "Closed at",
      tags: "Tags",
      mistakes: "Mistakes",
      preNotes: "Pre-trade notes",
      postNotes: "Post-trade notes",
      lesson: "Lesson learned",
      notes: "Journal notes"
    },
    markets: { crypto: "Crypto", forex: "Forex", stocks: "Global Stocks" },
    sides: { long: "Long", short: "Short" },
    statuses: { open: "Open", closed: "Closed", planned: "Planned", canceled: "Canceled" },
    reviewStatuses: { open: "Open", completed: "Completed", skipped: "Skipped" } as Record<string, string>,
    importance: { low: "Low", medium: "Medium", high: "High", critical: "Critical" } as Record<string, string>,
    rules: { followed: "Followed", broken: "Broken", mixed: "Mixed", unknown: "Unknown" }
  },
  fa: {
    eyebrow: "ژورنال معامله",
    description:
      "زمینه کامل هر معامله را مرور کنید: پلن، ریسک، روان‌شناسی، پایبندی به قوانین، خطاها و درسی که باید جلسه بعدی را بهتر کند.",
    loading: "در حال بارگذاری ژورنال",
    unavailable: "ژورنال در دسترس نیست",
    loadFailed: "بارگذاری ژورنال ممکن نشد. صفحه را دوباره باز کنید یا چند لحظه بعد تلاش کنید.",
    createFailed: "ثبت معامله انجام نشد. چند لحظه بعد دوباره تلاش کنید.",
    quickFailed: "ذخیره معامله انجام نشد. چند لحظه بعد دوباره تلاش کنید.",
    stats: { trades: "معاملات", winRate: "نرخ برد", netPnl: "سود و زیان خالص", expectancy: "امید ریاضی", maxDrawdown: "بیشترین افت سرمایه" },
    equityCurve: "منحنی سرمایه",
    none: "ندارد",
    systemSetups: { "planned-trade-conversion": "از روی پلن" } as Record<string, string>,
    systemTags: { "converted-plan": "پلن تبدیل‌شده" } as Record<string, string>,
    emptyTitle: "هنوز معامله‌ای ثبت نشده است",
    emptyDescription:
      "بعد از ورود معاملات، ژورنال، آمار و منحنی سرمایه اینجا دیده می‌شوند. تاریخچه MT5 را وارد کنید یا با فرم زیر یک معامله را دستی ثبت کنید.",
    emptyImport: "ورود معاملات MT5",
    importCta: "ورود CSV",
    search: "جستجوی نماد، ستاپ، یادداشت یا خطا",
    filters: "میز کار ژورنال",
    filtersDesc: "قبل از مرور رفتار و نتیجه، رکوردها را محدود کنید.",
    add: "افزودن معامله مرور‌شده",
    addDesc: "پلن، نتیجه، احساس و درس را در یک رکورد ساختاریافته ثبت کنید.",
    refresh: "به‌روزرسانی",
    create: "ثبت معامله",
    creating: "در حال ثبت...",
    reset: "پاک‌سازی فرم",
    table: "گزارش معاملات",
    tableDesc: "معامله‌های اخیر همراه با ریسک، R، نتیجه رعایت قوانین و یادداشت‌های ژورنال.",
    selected: "پرونده معامله",
    selectedDesc: "پنل مرور متمرکز برای رکورد انتخاب‌شده.",
    noSelection: "برای مرور یادداشت‌ها، ریسک‌ها، خطاها و درس‌ها یک معامله را انتخاب کنید.",
    discipline: "انضباط قوانین",
    distribution: "توزیع R",
    distributionDesc: "مقادیر R معاملات بسته‌شده. رنگ با برچسب همراه است تا خوانایی حفظ شود.",
    allMarkets: "همه بازارها",
    allStatuses: "همه وضعیت‌ها",
    process: "خط زمان مرور",
    before: "قبل از معامله",
    during: "رکورد معامله",
    after: "بعد از معامله",
    lessonPrompt: "از این معامله چه چیزی یاد گرفتید؟",
    lessonHelp: "یک رفتار یا قانون بنویسید که دفعه بعد باید زودتر تشخیص داده شود.",
    related: "زمینه مرتبط ذهن دوم",
    relatedEmpty: "هنوز ایده، مرور یا زمینه خبری مرتبطی ثبت نشده است.",
    ideaContext: "ایده‌ها",
    reviewContext: "مرورها",
    newsContext: "زمینه خبر",
    screenshot: "اسکرین‌شات یا یادداشت نمودار",
    screenshotEmpty: "هنوز اسکرین‌شاتی ذخیره نشده است.",
    screenshotField: "اسکرین‌شات نمودار",
    screenshotHint: "یک تصویر نمودار ضمیمه کنید (PNG، JPG، WebP، GIF). تصویر کوچک‌سازی و به‌صورت خصوصی با رکورد ذخیره می‌شود.",
    screenshotUpload: "بارگذاری تصویر",
    screenshotProcessing: "در حال بهینه‌سازی...",
    screenshotRemove: "حذف",
    screenshotUrlLabel: "یا نشانی تصویر را بچسبانید",
    screenshotOpen: "باز کردن تصویر کامل",
    screenshotTooBig: "تصویر حتی پس از بهینه‌سازی بزرگ است. برش کوچک‌تری امتحان کنید.",
    screenshotBadType: "فایل پشتیبانی نمی‌شود. از PNG، JPG، WebP یا GIF استفاده کنید.",
    screenshotSourceTooBig: "حجم فایل زیاد است. تصویری کمتر از ۱۲ مگابایت انتخاب کنید.",
    screenshotFailed: "پردازش تصویر ممکن نشد. فایل دیگری امتحان کنید.",
    privateNote: "داده خصوصی مرور. این محیط فقط برای تحلیل و یادگیری است.",
    required: "ضروری",
    optional: "اختیاری",
    tradeBasics: "مشخصات معامله",
    riskAndOutcome: "ریسک و نتیجه",
    reviewNotes: "یادداشت‌های مرور",
    journalPlaceholder: "بنویسید چه اتفاقی افتاد و کدام شواهد مهم بودند.",
    autoIfBlank: "اگر خالی بماند خودکار محاسبه می‌شود",
    commaSeparated: "با ویرگول جدا کنید",
    placeholders: {
      session: "مثلاً لندن، نیویورک",
      setup: "مثلاً بازگشت پس از شکست",
      confidence: "۱ تا ۱۰",
      riskPercent: "مثلاً ۱",
      outcome: "مثلاً مطابق پلن",
      emotion: "مثلاً متمرکز",
      tags: "مثلاً شکست، مرور",
      mistakes: "مثلاً ورود دیر، حجم زیاد",
      preNotes: "پلن چه بود و چرا این ستاپ؟",
      postNotes: "معامله چگونه مدیریت شد و چرا تمام شد؟",
      lesson: "یک رفتار یا قانون برای تشخیص سریع‌تر دفعه بعد."
    },
    noClosedData: "هنوز داده R برای معامله بسته‌شده وجود ندارد.",
    quickTitle: "ورود سریع",
    quickDesc: "در کمتر از ۳۰ ثانیه رکورد بزنید. جزئیات را بعداً تکمیل کنید.",
    quickSave: "ذخیره سریع",
    quickSaving: "در حال ذخیره...",
    quickReset: "پاک‌سازی",
    unplanned: "بدون پلن",
    labels: {
      symbol: "نماد",
      market: "بازار",
      side: "سمت",
      status: "وضعیت",
      strategy: "استراتژی",
      entry: "قیمت ورود",
      exit: "قیمت خروج",
      stop: "حد ضرر",
      target: "حد سود",
      quantity: "حجم",
      riskAmount: "مبلغ ریسک",
      riskPercent: "درصد ریسک",
      rMultiple: "ضریب R",
      pnl: "سود و زیان",
      fees: "کارمزد",
      session: "جلسه",
      setup: "ستاپ",
      confidence: "اعتماد",
      rule: "نتیجه قانون",
      emotion: "احساس",
      outcome: "نتیجه",
      opened: "زمان باز شدن",
      closed: "زمان بسته شدن",
      tags: "برچسب‌ها",
      mistakes: "خطاها",
      preNotes: "یادداشت قبل از معامله",
      postNotes: "یادداشت بعد از معامله",
      lesson: "درس آموخته‌شده",
      notes: "یادداشت ژورنال"
    },
    markets: { crypto: "کریپتو", forex: "فارکس", stocks: "سهام جهانی" },
    sides: { long: "لانگ", short: "شورت" },
    statuses: { open: "باز", closed: "بسته", planned: "برنامه‌ریزی", canceled: "لغو‌شده" },
    reviewStatuses: { open: "باز", completed: "تکمیل‌شده", skipped: "ردشده" } as Record<string, string>,
    importance: { low: "کم", medium: "متوسط", high: "زیاد", critical: "بحرانی" } as Record<string, string>,
    rules: { followed: "رعایت شد", broken: "نقض شد", mixed: "ترکیبی", unknown: "نامشخص" }
  }
} as const;

// Source-file ceiling before optimizing, and the stored data-URL ceiling.
const screenshotMaxSourceBytes = 12 * 1024 * 1024;
const screenshotMaxStoredBytes = 1024 * 1024;

export function JournalScreen({ locale, messages }: { locale: Locale; messages: Messages }) {
  const c = copy[locale];
  const [trades, setTrades] = useState<Trade[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [market, setMarket] = useState<Market | "all">("all");
  const [status, setStatus] = useState<TradeStatus | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  // A closed trade needs its exit price and close time, so the full form follows the status it is set to.
  const [formStatus, setFormStatus] = useState<TradeStatus>("open");
  const [closedAt, setClosedAt] = useState("");
  const [closedAtAuto, setClosedAtAuto] = useState(false);

  function changeFormStatus(next: TradeStatus) {
    setFormStatus(next);
    if (next === "closed") {
      if (!closedAt) {
        setClosedAt(toLocalDateTimeValue(new Date()));
        setClosedAtAuto(true);
      }
    } else if (closedAtAuto) {
      // Only the time filled in for the trader goes away again; one they typed stays.
      setClosedAt("");
      setClosedAtAuto(false);
    }
  }

  // Runs on the Reset button and on formEl.reset() after a save: the browser puts the fields back, this the state behind them.
  function resetFormStatus() {
    setFormStatus("open");
    setClosedAt("");
    setClosedAtAuto(false);
  }

  async function load() {
    setLoading(true);
    // The loading state unmounts the form and the next one starts blank, so the status and close time behind it start over too.
    resetFormStatus();
    try {
      const [tradeData, metricData, strategyData, ideaData, reviewData, newsData] = await Promise.all([
        apiFetch<{ trades: Trade[] }>("/api/trades"),
        apiFetch<{ metrics: Metrics }>("/api/trades/metrics"),
        apiFetch<{ strategies: Strategy[] }>("/api/strategies"),
        apiFetch<{ ideas: Idea[] }>("/api/ideas"),
        apiFetch<{ reviews: Review[] }>("/api/reviews"),
        apiFetch<{ news: NewsItem[] }>(`/api/news?locale=${locale}`)
      ]);
      setTrades(tradeData.trades);
      setMetrics(metricData.metrics);
      setStrategies(strategyData.strategies);
      setIdeas(ideaData.ideas);
      setReviews(reviewData.reviews);
      setNews(newsData.news);
      setSelectedId((current) => current ?? tradeData.trades[0]?.id ?? null);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredTrades = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return trades.filter((trade) => {
      const matchesMarket = market === "all" || trade.market === market;
      const matchesStatus = status === "all" || trade.status === status;
      const haystack = [
        trade.symbol,
        trade.setupType,
        // The names the page shows for values the product wrote, so what the trader reads is what the search finds.
        trade.setupType ? systemLabel(c.systemSetups, trade.setupType) : null,
        trade.session,
        trade.strategy?.name,
        trade.preTradeNotes,
        trade.postTradeNotes,
        trade.lessonsLearned,
        trade.journalEntry?.notes,
        trade.journalEntry?.lessonsLearned,
        ...(trade.journalEntry?.tags ?? []),
        ...(trade.journalEntry?.tags ?? []).map((tag) => systemLabel(c.systemTags, tag)),
        ...(trade.journalEntry?.mistakes ?? [])
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchesMarket && matchesStatus && (!normalized || haystack.includes(normalized));
    });
  }, [c, market, query, status, trades]);

  const legIds = useMemo(() => entryLegIds(trades), [trades]);
  const selectedTrade = useMemo(
    () => trades.find((trade) => trade.id === selectedId) ?? filteredTrades[0] ?? null,
    [filteredTrades, selectedId, trades]
  );

  const ruleStats = useMemo(() => {
    const relevant = trades.filter((trade) => trade.ruleFollowed !== "unknown");
    const followed = relevant.filter((trade) => trade.ruleFollowed === "followed").length;
    return {
      followed,
      broken: relevant.filter((trade) => trade.ruleFollowed === "broken").length,
      mixed: relevant.filter((trade) => trade.ruleFollowed === "mixed").length,
      rate: relevant.length > 0 ? followed / relevant.length : 0
    };
  }, [trades]);

  const rDistribution = useMemo(
    () =>
      trades
        .filter((trade) => typeof trade.rMultiple === "number")
        .slice(0, 12)
        .map((trade) => ({
          label: trade.symbol,
          value: Number(trade.rMultiple ?? 0),
          tone: ((trade.rMultiple ?? 0) >= 0 ? "success" : "danger") as "success" | "danger"
        })),
    [trades]
  );

  const related = useMemo(() => {
    if (!selectedTrade) {
      return { ideas: [], reviews: [], news: [] };
    }

    return {
      ideas: ideas
        .filter((idea) => idea.symbols.includes(selectedTrade.symbol) || idea.market === selectedTrade.market)
        .slice(0, 3),
      reviews: reviews
        .filter(
          (review) =>
            review.linkedTradeIds.includes(selectedTrade.id) ||
            (selectedTrade.strategyId ? review.linkedStrategyIds.includes(selectedTrade.strategyId) : false)
        )
        .slice(0, 3),
      news: news
        .filter((item) => item.relatedSymbols.includes(selectedTrade.symbol) || item.market === selectedTrade.market)
        .slice(0, 3)
    };
  }, [ideas, news, reviews, selectedTrade]);

  async function handleScreenshot(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const check = validateImageFile(file, { maxBytes: screenshotMaxSourceBytes });
    if (!check.ok) {
      setScreenshotError(check.error === "type" ? c.screenshotBadType : c.screenshotSourceTooBig);
      return;
    }

    setScreenshotBusy(true);
    setScreenshotError(null);
    try {
      let dataUrl = await fileToCompressedDataUrl(file, { maxEdge: 1280, quality: 0.72 });
      if (estimateDataUrlBytes(dataUrl) > screenshotMaxStoredBytes) {
        dataUrl = await fileToCompressedDataUrl(file, { maxEdge: 1024, quality: 0.6 });
      }
      if (estimateDataUrlBytes(dataUrl) > screenshotMaxStoredBytes) {
        setScreenshotError(c.screenshotTooBig);
        return;
      }
      setScreenshot(dataUrl);
    } catch {
      setScreenshotError(c.screenshotFailed);
    } finally {
      setScreenshotBusy(false);
    }
  }

  function clearScreenshot() {
    setScreenshot(null);
    setScreenshotError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // React clears event.currentTarget once the handler returns its promise, so take the form before awaiting.
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setSubmitting(true);
    setFormError(null);
    try {
      const mistakes = splitList(form.get("mistakes"));
      const tags = splitList(form.get("tags"));
      const created = await apiFetch<{ sampleRemoved?: boolean }>("/api/trades", {
        method: "POST",
        body: JSON.stringify({
          strategyId: nullable(form.get("strategyId")),
          symbol: form.get("symbol"),
          market: form.get("market"),
          side: form.get("side"),
          status: form.get("status"),
          entryPrice: form.get("entryPrice"),
          exitPrice: nullable(form.get("exitPrice")),
          stopLoss: nullable(form.get("stopLoss")),
          takeProfit: nullable(form.get("takeProfit")),
          quantity: form.get("quantity"),
          riskAmount: nullable(form.get("riskAmount")),
          riskPercent: nullable(form.get("riskPercent")),
          rMultiple: nullable(form.get("rMultiple")),
          realizedPnl: nullable(form.get("realizedPnl")),
          fees: form.get("fees") || 0,
          session: nullable(form.get("session")),
          setupType: nullable(form.get("setupType")),
          confidenceScore: nullable(form.get("confidenceScore")),
          ruleFollowed: form.get("ruleFollowed"),
          outcome: nullable(form.get("outcome")),
          preTradeNotes: nullable(form.get("preTradeNotes")),
          postTradeNotes: nullable(form.get("postTradeNotes")),
          lessonsLearned: nullable(form.get("lessonsLearned")),
          openedAt: localDateTimeToIso(form.get("openedAt")),
          closedAt: localDateTimeToIso(form.get("closedAt")),
          journal: {
            emotionalState: nullable(form.get("emotionalState")),
            mistakes,
            tags,
            notes: nullable(form.get("notes")),
            preTradeNotes: nullable(form.get("preTradeNotes")),
            postTradeNotes: nullable(form.get("postTradeNotes")),
            lessonsLearned: nullable(form.get("lessonsLearned")),
            ruleFollowed: form.get("ruleFollowed"),
            screenshotUrl: screenshot ?? nullable(form.get("screenshotUrl"))
          }
        })
      });
      formEl.reset();
      clearScreenshot();
      // The first real trade removed the sample data: the label above the page must say so now, not at its next check.
      if (created?.sampleRemoved) announceSampleRemoved();
      await load();
    } catch (err) {
      if (isAuthError(err)) {
        // The session ended while the form was open: show the sign-in state instead of a raw message.
        setError(err);
        return;
      }
      setFormError(apiErrorText(err, locale, c.createFailed, tradeFieldLabels(c.labels)));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState label={c.loading} />;
  if (error) {
    if (isAuthError(error)) return <AuthRequiredState locale={locale} />;
    return <ErrorState title={c.unavailable} description={apiErrorText(error, locale, c.loadFailed)} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={c.eyebrow}
        title={t(messages, "pages.journal")}
        description={c.description}
        action={
          <Link
            href={`/${locale}/import`}
            className="inline-flex min-h-11 items-center rounded-md border border-border bg-muted/80 px-4 text-sm font-semibold text-foreground transition hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <UploadCloud className="me-2 size-4" aria-hidden="true" />
            {c.importCta}
          </Link>
        }
      />

      <div className="rounded-lg border border-primary/20 bg-primary/10 p-4 text-sm leading-6 text-foreground">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <p>{c.privateNote}</p>
        </div>
      </div>

      {trades.length === 0 ? (
        <>
          <EmptyState
            title={c.emptyTitle}
            description={c.emptyDescription}
            actions={[{ href: `/${locale}/import`, label: c.emptyImport }]}
          />
          <SampleDataOffer locale={locale} />
        </>
      ) : null}

      <QuickEntryPanel c={c} locale={locale} onCreated={load} onAuthError={setError} />

      {/* No zeroed stat cards for an account with no trades: they read as results. */}
      {metrics && trades.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label={c.stats.trades} value={String(metrics.totalTrades)} compact />
          <StatCard label={c.stats.winRate} value={formatPercent(metrics.winRate, locale)} compact />
          <StatCard label={c.stats.netPnl} value={formatMoney(metrics.netPnl, locale)} tone={metrics.netPnl >= 0 ? "success" : "danger"} compact />
          <StatCard label={c.stats.expectancy} value={formatMoney(metrics.expectancy, locale)} compact />
          <StatCard label={c.stats.maxDrawdown} value={formatMoney(metrics.maxDrawdownAmount, locale)} tone="warning" compact />
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <div className="space-y-4">
          {/* Nothing to filter or list on an empty journal: the empty state above is the only message. */}
          {trades.length > 0 ? (
            <>
            <SectionPanel
              title={c.filters}
              description={c.filtersDesc}
              action={
                <Button variant="secondary" onClick={load} type="button">
                  <RefreshCw className="me-2 size-4" aria-hidden="true" />
                  {c.refresh}
                </Button>
              }
            >
              <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px]">
                <div className="relative">
                  <Search className="pointer-events-none absolute start-3 top-3.5 size-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    className="ps-9"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={c.search}
                    aria-label={c.search}
                  />
                </div>
                <Select value={market} onChange={(event) => setMarket(event.target.value as Market | "all")} aria-label={c.labels.market}>
                  <option value="all">{c.allMarkets}</option>
                  <option value="crypto">{c.markets.crypto}</option>
                  <option value="forex">{c.markets.forex}</option>
                  <option value="stocks">{c.markets.stocks}</option>
                </Select>
                <Select value={status} onChange={(event) => setStatus(event.target.value as TradeStatus | "all")} aria-label={c.labels.status}>
                  <option value="all">{c.allStatuses}</option>
                  <option value="open">{c.statuses.open}</option>
                  <option value="closed">{c.statuses.closed}</option>
                  <option value="planned">{c.statuses.planned}</option>
                  <option value="canceled">{c.statuses.canceled}</option>
                </Select>
              </div>
            </SectionPanel>

            <SectionPanel title={c.table} description={c.tableDesc}>
              <div className="md:hidden">
                <MobileDataList
                  rows={filteredTrades}
                  getKey={(row) => row.id}
                  emptyTitle={t(messages, "common.emptyTitle")}
                  emptyDescription={t(messages, "common.emptyDescription")}
                  render={(row) => (
                    <button type="button" className="w-full text-start" onClick={() => setSelectedId(row.id)}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold text-foreground">{row.symbol}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {c.markets[row.market]} / {row.setupType ? systemLabel(c.systemSetups, row.setupType) : c.labels.setup}
                          </p>
                        </div>
                        <RuleBadge value={row.ruleFollowed} labels={c.rules} />
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                        <MobileCell label={c.labels.pnl} value={row.realizedPnl === null ? "-" : formatMoney(row.realizedPnl, locale)} />
                        <MobileCell label="R" value={row.rMultiple === null ? "-" : row.rMultiple.toFixed(2)} />
                        <MobileCell label={c.labels.status} value={c.statuses[row.status]} />
                      </div>
                    </button>
                  )}
                />
              </div>
              <div className="hidden md:block">
                <DataTable
                  rows={filteredTrades}
                  emptyTitle={t(messages, "common.emptyTitle")}
                  emptyDescription={t(messages, "common.emptyDescription")}
                  columns={[
                    {
                      key: "symbol",
                      header: c.labels.symbol,
                      cell: (row) => (
                        <div className="flex flex-col gap-1">
                          <button
                            className="text-start font-semibold text-foreground transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            onClick={() => setSelectedId(row.id)}
                            type="button"
                          >
                            {row.symbol}
                          </button>
                          {!row.strategyId && <Badge tone="warning">{c.unplanned}</Badge>}
                        </div>
                      )
                    },
                    { key: "market", header: c.labels.market, cell: (row) => <Badge>{c.markets[row.market]}</Badge> },
                    { key: "side", header: c.labels.side, cell: (row) => <Badge tone={row.side === "long" ? "success" : "danger"}>{c.sides[row.side]}</Badge> },
                    {
                      key: "pnl",
                      header: c.labels.pnl,
                      cell: (row) => (
                        <span className={cn("tabular-nums", row.realizedPnl !== null && row.realizedPnl < 0 ? "text-destructive" : "text-success")}>
                          {row.realizedPnl === null ? "-" : formatMoney(row.realizedPnl, locale)}
                        </span>
                      )
                    },
                    { key: "r", header: "R", cell: (row) => <span className="tabular-nums">{row.rMultiple === null ? "-" : row.rMultiple.toFixed(2)}</span> },
                    { key: "rule", header: c.labels.rule, cell: (row) => <RuleBadge value={row.ruleFollowed} labels={c.rules} /> },
                    { key: "status", header: c.labels.status, cell: (row) => <Badge>{c.statuses[row.status]}</Badge> }
                  ]}
                />
              </div>
            </SectionPanel>
            </>
          ) : null}

          <SectionPanel title={c.add} description={c.addDesc}>
            {formError ? (
              <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
            <form className="space-y-6" onSubmit={submit} onReset={resetFormStatus}>
              <fieldset className="grid gap-4 lg:grid-cols-4">
                <legend className="mb-3 text-sm font-semibold text-foreground">{c.tradeBasics}</legend>
                <Field label={c.labels.symbol} hint={c.required}>
                  <Input name="symbol" placeholder="BTCUSDT" required />
                </Field>
                <Field label={c.labels.market} hint={c.required}>
                  <Select name="market" defaultValue="crypto">
                    <option value="crypto">{c.markets.crypto}</option>
                    <option value="forex">{c.markets.forex}</option>
                    <option value="stocks">{c.markets.stocks}</option>
                  </Select>
                </Field>
                <Field label={c.labels.side} hint={c.required}>
                  <Select name="side" defaultValue="long">
                    <option value="long">{c.sides.long}</option>
                    <option value="short">{c.sides.short}</option>
                  </Select>
                </Field>
                <Field label={c.labels.status} hint={c.required}>
                  <Select name="status" value={formStatus} onChange={(event) => changeFormStatus(event.target.value as TradeStatus)}>
                    <option value="open">{c.statuses.open}</option>
                    <option value="closed">{c.statuses.closed}</option>
                    <option value="planned">{c.statuses.planned}</option>
                    <option value="canceled">{c.statuses.canceled}</option>
                  </Select>
                </Field>
                <Field label={c.labels.strategy} hint={c.optional}>
                  <Select name="strategyId" defaultValue="">
                    <option value="">-</option>
                    {strategies.map((strategy) => (
                      <option key={strategy.id} value={strategy.id}>
                        {strategy.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={c.labels.session}>
                  <Input name="session" placeholder={c.placeholders.session} />
                </Field>
                <Field label={c.labels.setup}>
                  <Input name="setupType" placeholder={c.placeholders.setup} />
                </Field>
                <Field label={c.labels.confidence}>
                  <Input name="confidenceScore" placeholder={c.placeholders.confidence} inputMode="numeric" />
                </Field>
              </fieldset>

              <fieldset className="grid gap-4 border-t border-border pt-5 lg:grid-cols-4">
                <legend className="mb-3 text-sm font-semibold text-foreground">{c.riskAndOutcome}</legend>
                <Field label={c.labels.entry} hint={c.required}>
                  <Input name="entryPrice" placeholder="65000" inputMode="decimal" required />
                </Field>
                <Field label={c.labels.exit} hint={formStatus === "closed" ? c.required : undefined}>
                  <Input name="exitPrice" placeholder="66000" inputMode="decimal" required={formStatus === "closed"} />
                </Field>
                <Field label={c.labels.stop}>
                  <Input name="stopLoss" placeholder="64000" inputMode="decimal" />
                </Field>
                <Field label={c.labels.target}>
                  <Input name="takeProfit" placeholder="67000" inputMode="decimal" />
                </Field>
                <Field label={c.labels.quantity} hint={c.required}>
                  <Input name="quantity" placeholder="0.1" inputMode="decimal" required />
                </Field>
                <Field label={c.labels.riskAmount}>
                  <Input name="riskAmount" placeholder={c.autoIfBlank} inputMode="decimal" />
                </Field>
                <Field label={c.labels.riskPercent}>
                  <Input name="riskPercent" placeholder={c.placeholders.riskPercent} inputMode="decimal" />
                </Field>
                <Field label={c.labels.rMultiple}>
                  <Input name="rMultiple" placeholder={c.autoIfBlank} inputMode="decimal" />
                </Field>
                <Field label={c.labels.pnl}>
                  <Input name="realizedPnl" placeholder={c.autoIfBlank} inputMode="decimal" />
                </Field>
                <Field label={c.labels.fees}>
                  <Input name="fees" placeholder="0" inputMode="decimal" />
                </Field>
                <Field label={c.labels.rule}>
                  <Select name="ruleFollowed" defaultValue="unknown">
                    <option value="unknown">{c.rules.unknown}</option>
                    <option value="followed">{c.rules.followed}</option>
                    <option value="mixed">{c.rules.mixed}</option>
                    <option value="broken">{c.rules.broken}</option>
                  </Select>
                </Field>
                <Field label={c.labels.outcome}>
                  <Input name="outcome" placeholder={c.placeholders.outcome} />
                </Field>
                <Field label={c.labels.opened} hint={c.required}>
                  <Input name="openedAt" type="datetime-local" defaultValue={toLocalDateTimeValue(new Date())} required />
                </Field>
                <Field label={c.labels.closed} hint={formStatus === "closed" ? c.required : undefined}>
                  <Input
                    name="closedAt"
                    type="datetime-local"
                    value={closedAt}
                    onChange={(event) => {
                      setClosedAt(event.target.value);
                      setClosedAtAuto(false);
                    }}
                    required={formStatus === "closed"}
                  />
                </Field>
              </fieldset>

              <fieldset className="grid gap-4 border-t border-border pt-5 lg:grid-cols-2">
                <legend className="mb-3 text-sm font-semibold text-foreground">{c.reviewNotes}</legend>
                <Field label={c.labels.emotion}>
                  <Input name="emotionalState" placeholder={c.placeholders.emotion} />
                </Field>
                <Field label={c.labels.tags} hint={c.commaSeparated}>
                  <Input name="tags" placeholder={c.placeholders.tags} />
                </Field>
                <Field label={c.labels.mistakes} hint={c.commaSeparated}>
                  <Input name="mistakes" placeholder={c.placeholders.mistakes} />
                </Field>
                <Field label={c.labels.preNotes}>
                  <Textarea name="preTradeNotes" className="min-h-28" placeholder={c.placeholders.preNotes} />
                </Field>
                <Field label={c.labels.postNotes}>
                  <Textarea name="postTradeNotes" className="min-h-28" placeholder={c.placeholders.postNotes} />
                </Field>
                <Field label={c.lessonPrompt} hint={c.lessonHelp}>
                  <Textarea name="lessonsLearned" className="min-h-28" placeholder={c.placeholders.lesson} />
                </Field>
                <Field label={c.labels.notes}>
                  <Textarea name="notes" className="min-h-28" placeholder={c.journalPlaceholder} />
                </Field>
                <div className="lg:col-span-2">
                  <Field label={c.screenshotField} hint={c.screenshotHint}>
                    <div className="space-y-3">
                      {screenshot ? (
                        <div className="relative w-fit">
                          <img src={screenshot} alt={c.screenshotField} className="max-h-56 rounded-md border border-border object-contain" />
                          <button
                            type="button"
                            onClick={clearScreenshot}
                            className="absolute end-2 top-2 inline-flex size-8 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-sm transition hover:border-destructive/50 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            aria-label={c.screenshotRemove}
                          >
                            <X className="size-4" aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-center transition hover:border-primary/50 hover:bg-primary/5 focus-within:ring-2 focus-within:ring-primary">
                          <ImagePlus className="mb-2 size-6 text-primary" aria-hidden="true" />
                          <span className="text-sm font-semibold text-foreground">{screenshotBusy ? c.screenshotProcessing : c.screenshotUpload}</span>
                          <input
                            className="sr-only"
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            onChange={handleScreenshot}
                            disabled={screenshotBusy}
                          />
                        </label>
                      )}
                      {screenshotError ? (
                        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive" role="alert">
                          {screenshotError}
                        </p>
                      ) : null}
                      {!screenshot ? (
                        <Input name="screenshotUrl" type="url" placeholder={c.screenshotUrlLabel} aria-label={c.screenshotUrlLabel} />
                      ) : null}
                    </div>
                  </Field>
                </div>
              </fieldset>

              <div className="flex flex-col gap-3 pb-24 sm:flex-row lg:pb-0">
                <Button disabled={submitting}>
                  <Plus className="me-2 size-4" aria-hidden="true" />
                  {submitting ? c.creating : c.create}
                </Button>
                <Button type="reset" variant="secondary">
                  <Filter className="me-2 size-4" aria-hidden="true" />
                  {c.reset}
                </Button>
              </div>
            </form>
          </SectionPanel>
        </div>

        <div className="space-y-4">
          <TradeDossier
            trade={selectedTrade}
            locale={locale}
            copy={c}
            related={related}
            onSelectRelatedTrade={(id) => setSelectedId(id)}
            entryTrades={
              selectedTrade
                ? (legIds.get(selectedTrade.id) ?? [selectedTrade.id]).flatMap((id) => trades.filter((trade) => trade.id === id))
                : []
            }
            onReviewSaved={(saved) => setTrades((current) => current.map((trade) => saved.find((item) => item.id === trade.id) ?? trade))}
          />

          {/* Nothing to count yet: zeros here would read as results, and the empty state above already says so. */}
          {trades.length > 0 ? (
            <>
              <SectionPanel title={c.discipline} description={`${formatPercent(ruleStats.rate, locale)} ${c.rules.followed.toLowerCase()}.`}>
                <div className="grid grid-cols-3 gap-3">
                  <MiniMetric label={c.rules.followed} value={String(ruleStats.followed)} tone="success" />
                  <MiniMetric label={c.rules.mixed} value={String(ruleStats.mixed)} tone="warning" />
                  <MiniMetric label={c.rules.broken} value={String(ruleStats.broken)} tone="danger" />
                </div>
              </SectionPanel>

              <SectionPanel title={c.distribution} description={c.distributionDesc}>
                <MiniBars data={rDistribution} valueFormatter={(value) => value.toFixed(2)} emptyLabel={c.noClosedData} />
              </SectionPanel>
            </>
          ) : null}

          {metrics?.equityCurve?.length ? (
            <PremiumPanel className="p-4">
              <p className="text-sm font-semibold text-foreground">{c.equityCurve}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{c.distributionDesc}</p>
              <Sparkline values={metrics.equityCurve} label={c.equityCurve} className="mt-4" />
            </PremiumPanel>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TradeDossier({
  trade,
  locale,
  copy: c,
  related,
  entryTrades,
  onReviewSaved
}: {
  trade: Trade | null;
  locale: Locale;
  copy: (typeof copy)[Locale];
  related: { ideas: Idea[]; reviews: Review[]; news: NewsItem[] };
  onSelectRelatedTrade: (id: string) => void;
  entryTrades: Trade[];
  onReviewSaved: (trades: Trade[]) => void;
}) {
  if (!trade) {
    return (
      <SectionPanel title={c.selected} description={c.selectedDesc}>
        <p className="text-sm leading-6 text-muted-foreground">{c.noSelection}</p>
      </SectionPanel>
    );
  }

  const lesson = trade.journalEntry?.lessonsLearned ?? trade.lessonsLearned;
  const confidence = typeof trade.confidenceScore === "number" ? trade.confidenceScore / 10 : 0;
  const relatedCount = related.ideas.length + related.reviews.length + related.news.length;

  return (
    <SectionPanel title={c.selected} description={c.selectedDesc}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold text-foreground">{trade.symbol}</h2>
              <Badge>{c.markets[trade.market]}</Badge>
              <Badge tone={trade.side === "long" ? "success" : "danger"}>{c.sides[trade.side]}</Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {trade.setupType ? systemLabel(c.systemSetups, trade.setupType) : c.labels.setup} / {trade.session ?? c.labels.session} / {formatDate(trade.openedAt, locale)}
            </p>
          </div>
          <RuleBadge value={trade.ruleFollowed} labels={c.rules} />
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="grid grid-cols-2 gap-3">
            <MiniMetric label={c.labels.pnl} value={trade.realizedPnl === null ? "-" : formatMoney(trade.realizedPnl, locale)} tone={trade.realizedPnl !== null && trade.realizedPnl < 0 ? "danger" : "success"} />
            <MiniMetric label="R" value={trade.rMultiple === null ? "-" : trade.rMultiple.toFixed(2)} />
            <MiniMetric label={c.labels.riskAmount} value={trade.riskAmount === null ? "-" : formatMoney(trade.riskAmount, locale)} />
            <MiniMetric label={c.labels.confidence} value={trade.confidenceScore ? `${trade.confidenceScore}/10` : "-"} />
          </div>
          <ProgressRing value={confidence} label={c.labels.confidence} className="mx-auto" />
        </div>

        <div>
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <BookOpenCheck className="size-4 text-primary" aria-hidden="true" />
            {c.process}
          </p>
          <div className="space-y-3 border-s border-border ps-4">
            <TimelineStep icon={FileText} title={c.before} value={trade.journalEntry?.preTradeNotes ?? trade.preTradeNotes} fallback={c.journalPlaceholder} />
            <TimelineStep
              icon={ShieldCheck}
              title={c.during}
              value={`${c.labels.entry}: ${formatNumber(trade.entryPrice, locale)} / ${c.labels.exit}: ${trade.exitPrice === null ? "-" : formatNumber(trade.exitPrice, locale)}`}
              fallback="-"
            />
            <TimelineStep icon={Brain} title={c.after} value={trade.journalEntry?.postTradeNotes ?? trade.postTradeNotes ?? trade.journalEntry?.notes} fallback={c.journalPlaceholder} />
          </div>
        </div>

        <DetailBlock icon={Lightbulb} title={c.lessonPrompt} value={lesson} fallback={c.lessonHelp} tone="primary" />
        <TradeReviewEditor<Trade> key={trade.id} trade={trade} entryTrades={entryTrades} locale={locale} onSaved={onReviewSaved} />
        <ScreenshotBlock url={trade.journalEntry?.screenshotUrl} copy={c} />

        <div className="grid gap-4 sm:grid-cols-2">
          <TokenBlock title={c.labels.mistakes} items={trade.journalEntry?.mistakes ?? []} none={c.none} tone="danger" />
          <TokenBlock title={c.labels.tags} items={trade.journalEntry?.tags ?? []} names={c.systemTags} none={c.none} />
        </div>

        <div>
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Link2 className="size-4 text-primary" aria-hidden="true" />
            {c.related}
            <Badge>{String(relatedCount)}</Badge>
          </p>
          {relatedCount > 0 ? (
            <div className="space-y-3">
              <RelatedGroup title={c.ideaContext} items={related.ideas.map((idea) => `${idea.title} / ${idea.confidence}/10`)} />
              <RelatedGroup title={c.reviewContext} items={related.reviews.map((review) => `${review.title} / ${c.reviewStatuses[review.status] ?? review.status}`)} />
              <RelatedGroup title={c.newsContext} items={related.news.map((item) => `${item.title} / ${c.importance[item.importance] ?? item.importance}`)} />
            </div>
          ) : (
            <p className="rounded-md border border-border bg-muted/20 p-3 text-sm leading-6 text-muted-foreground">{c.relatedEmpty}</p>
          )}
        </div>
      </div>
    </SectionPanel>
  );
}

type QuickCopy = {
  quickTitle: string;
  quickDesc: string;
  quickSave: string;
  quickSaving: string;
  quickReset: string;
  quickFailed: string;
  labels: { symbol: string; market: string; side: string; entry: string; rule: string; mistakes: string; lesson: string; [k: string]: string };
  placeholders: { mistakes: string; lesson: string; [k: string]: string };
  markets: { crypto: string; forex: string; stocks: string };
  sides: { long: string; short: string };
  rules: { followed: string; mixed: string; broken: string; unknown: string; [k: string]: string };
};

/** The labels the page shows for the field names the server answers with when it rejects a trade. */
function tradeFieldLabels(labels: Record<string, string>): Record<string, string> {
  return {
    symbol: labels.symbol,
    market: labels.market,
    side: labels.side,
    status: labels.status,
    strategyId: labels.strategy,
    entryPrice: labels.entry,
    exitPrice: labels.exit,
    stopLoss: labels.stop,
    takeProfit: labels.target,
    quantity: labels.quantity,
    riskAmount: labels.riskAmount,
    riskPercent: labels.riskPercent,
    rMultiple: labels.rMultiple,
    realizedPnl: labels.pnl,
    fees: labels.fees,
    session: labels.session,
    setupType: labels.setup,
    confidenceScore: labels.confidence,
    ruleFollowed: labels.rule,
    outcome: labels.outcome,
    openedAt: labels.opened,
    closedAt: labels.closed
  };
}

function QuickEntryPanel({
  c,
  locale,
  onCreated,
  onAuthError
}: {
  c: QuickCopy;
  locale: Locale;
  onCreated: () => void;
  onAuthError: (error: unknown) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function quickSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // React clears event.currentTarget once the handler returns its promise, so take the form before awaiting.
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setSubmitting(true);
    setError(null);
    const mistakeRaw = form.get("mistakes");
    const mistakes = typeof mistakeRaw === "string" && mistakeRaw.trim()
      ? splitListInput(mistakeRaw)
      : [];
    try {
      const created = await apiFetch<{ sampleRemoved?: boolean }>("/api/trades", {
        method: "POST",
        body: JSON.stringify({
          symbol: form.get("symbol"),
          market: form.get("market"),
          side: form.get("side"),
          // The panel asks for no exit price or close time, so this is an open trade: a closed one without them counts nowhere.
          status: "open",
          entryPrice: form.get("entryPrice"),
          quantity: "1",
          fees: 0,
          ruleFollowed: form.get("ruleFollowed"),
          openedAt: new Date().toISOString(),
          journal: {
            mistakes,
            ruleFollowed: form.get("ruleFollowed"),
            lessonsLearned: form.get("lesson") || null
          }
        })
      });
      formEl.reset();
      if (created?.sampleRemoved) announceSampleRemoved();
      onCreated();
    } catch (err) {
      if (isAuthError(err)) {
        onAuthError(err);
        return;
      }
      setError(apiErrorText(err, locale, c.quickFailed, tradeFieldLabels(c.labels)));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <details className="group rounded-lg border border-border bg-muted/20">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div>
          <span className="text-sm font-semibold text-foreground">{c.quickTitle}</span>
          <span className="ms-3 text-xs text-muted-foreground">{c.quickDesc}</span>
        </div>
        <span className="text-xs text-muted-foreground group-open:hidden">▼</span>
        <span className="text-xs text-muted-foreground [display:none] group-open:inline">▲</span>
      </summary>
      <form onSubmit={quickSubmit} className="border-t border-border px-4 py-4">
        {error ? (
          <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <Field label={`${c.labels.symbol} *`}>
            <Input name="symbol" placeholder="BTCUSDT" required />
          </Field>
          <Field label={c.labels.market}>
            <Select name="market" defaultValue="crypto">
              <option value="crypto">{c.markets.crypto}</option>
              <option value="forex">{c.markets.forex}</option>
              <option value="stocks">{c.markets.stocks}</option>
            </Select>
          </Field>
          <Field label={c.labels.side}>
            <Select name="side" defaultValue="long">
              <option value="long">{c.sides.long}</option>
              <option value="short">{c.sides.short}</option>
            </Select>
          </Field>
          <Field label={`${c.labels.entry} *`}>
            <Input name="entryPrice" required inputMode="decimal" placeholder="65000" />
          </Field>
          <Field label={c.labels.rule}>
            <Select name="ruleFollowed" defaultValue="unknown">
              <option value="unknown">{c.rules.unknown}</option>
              <option value="followed">{c.rules.followed}</option>
              <option value="mixed">{c.rules.mixed}</option>
              <option value="broken">{c.rules.broken}</option>
            </Select>
          </Field>
          <Field label={c.labels.mistakes}>
            <Input name="mistakes" placeholder={c.placeholders.mistakes} />
          </Field>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-3">
            <Field label={c.labels.lesson}>
              <Input name="lesson" placeholder={c.placeholders.lesson} />
            </Field>
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? c.quickSaving : c.quickSave}
            </Button>
            <Button type="reset" variant="secondary">{c.quickReset}</Button>
          </div>
        </div>
      </form>
    </details>
  );
}

function nullable(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

const splitList = splitListInput;

/** The page-language name of a value the product wrote itself; a value the trader typed comes back as typed. */
function systemLabel(names: Record<string, string>, value: string) {
  return Object.prototype.hasOwnProperty.call(names, value) ? names[value] : value;
}

function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", { maximumFractionDigits: 5 }).format(value);
}

function RuleBadge({ value, labels }: { value: RuleResult; labels: Record<RuleResult, string> }) {
  const tone = value === "followed" ? "success" : value === "broken" ? "danger" : value === "mixed" ? "warning" : "default";
  return <Badge tone={tone}>{labels[value]}</Badge>;
}

function MobileCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold text-foreground">{value}</p>
    </div>
  );
}

function MiniMetric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "warning" | "danger" }) {
  const toneClass = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive"
  }[tone];
  return (
    <div className="rounded-md border border-border bg-muted/25 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-sm font-semibold tabular-nums", toneClass)}>{value}</p>
    </div>
  );
}

function DetailBlock({
  icon: Icon,
  title,
  value,
  fallback,
  tone = "default"
}: {
  icon: typeof Lightbulb;
  title: string;
  value?: string | null;
  fallback: string;
  tone?: "default" | "primary";
}) {
  return (
    <div className={cn("rounded-md border p-3", tone === "primary" ? "border-primary/25 bg-primary/10" : "border-border bg-muted/15")}>
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className={cn("size-4", tone === "primary" ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
        {title}
      </p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{value || fallback}</p>
    </div>
  );
}

function ScreenshotBlock({ url, copy: c }: { url?: string | null; copy: (typeof copy)[Locale] }) {
  return (
    <div className="rounded-md border border-border bg-muted/15 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Camera className="size-4 text-muted-foreground" aria-hidden="true" />
        {c.screenshot}
      </p>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="group mt-2 block focus-visible:outline-none" aria-label={c.screenshotOpen}>
          <img
            src={url}
            alt={c.screenshot}
            className="max-h-64 w-full rounded-md border border-border object-contain transition group-hover:border-primary/40 group-focus-visible:ring-2 group-focus-visible:ring-primary"
          />
          <span className="mt-1 inline-block text-xs text-muted-foreground group-hover:text-primary">{c.screenshotOpen}</span>
        </a>
      ) : (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{c.screenshotEmpty}</p>
      )}
    </div>
  );
}

function TimelineStep({ icon: Icon, title, value, fallback }: { icon: typeof FileText; title: string; value?: string | null; fallback: string }) {
  return (
    <div className="relative pb-2">
      <span className="absolute -start-[25px] top-1 grid size-5 place-items-center rounded-full border border-border bg-card">
        <Icon className="size-3 text-primary" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{value || fallback}</p>
    </div>
  );
}

function TokenBlock({
  title,
  items,
  none,
  names = {},
  tone = "default"
}: {
  title: string;
  items: string[];
  none: string;
  /** Page-language names for the values the product wrote itself. */
  names?: Record<string, string>;
  tone?: "default" | "danger";
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.length > 0 ? (
          items.map((item) => (
            <Badge key={item} tone={tone === "danger" ? "danger" : "default"}>
              {systemLabel(names, item)}
            </Badge>
          ))
        ) : (
          <Badge>{none}</Badge>
        )}
      </div>
    </div>
  );
}

function RelatedGroup({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-muted/15 p-3">
      <p className="text-xs font-semibold text-muted-foreground">{title}</p>
      <ul className="mt-2 space-y-2 text-sm leading-6 text-foreground">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <CheckCircle2 className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
