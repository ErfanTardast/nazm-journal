"use client";

import { useEffect, useMemo, useState } from "react";
import { Filter, Newspaper, RefreshCw, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { SectionPanel } from "@/components/ui/section-panel";
import { Select } from "@/components/ui/select";
import { AuthRequiredState, ErrorState, LoadingState } from "@/components/ui/state";
import { apiFetch, isAuthError } from "@/lib/api/client";
import { apiErrorText } from "@/lib/api/error-text";
import { t, type getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";

type Messages = ReturnType<typeof getMessages>;
type NewsItem = {
  id?: string;
  title: string;
  source: string;
  language: "en" | "fa" | string;
  market: "crypto" | "forex" | "stocks";
  category: string;
  importance: "low" | "medium" | "high" | "critical" | string;
  sentiment: string;
  summary: string;
  riskNotes: string[];
};
type NewsAnalysis = {
  whatHappened: string;
  affectedMarket: string;
  category: string;
  impactLevel: string;
  cautionNotes: string[];
  reviewChecklist: string[];
  disclaimer: string;
};

const copy = {
  en: {
    eyebrow: "Market context",
    description: "Review bilingual context for Forex, Crypto, and Global Stocks without treating headlines as market certainty.",
    filters: "Context filters",
    filtersDesc: "Filter by market, importance, category, or keyword before sending an item to analysis.",
    search: "Search title, summary, category",
    allMarkets: "All markets",
    allImportance: "All importance",
    allCategories: "All categories",
    marketFilter: "Market filter",
    importanceFilter: "Importance filter",
    categoryFilter: "Category filter",
    refresh: "Refresh",
    table: "Context queue",
    tableDesc: "Seeded and local-provider items for daily review.",
    columns: { title: "Title", market: "Market", importance: "Importance", category: "Category", source: "Source" },
    selected: "Selected context",
    selectedDesc: "Read the item and run a deterministic analysis workflow.",
    noSelection: "No context item selected.",
    riskNotes: "Risk notes",
    analysis: "Context analysis",
    analysisDesc: "Educational risk notes and a review checklist.",
    analyze: "Analyze context",
    analyzing: "Analyzing...",
    emptyAnalysis: "Select an item and run analysis to see structured caution notes.",
    whatHappened: "What happened",
    facts: { market: "Market", impact: "Impact", category: "Category", language: "Language" },
    languageValue: "EN",
    cautionNotes: "Caution notes",
    reviewChecklist: "Review checklist",
    safety: "News analysis is for awareness and review only. It does not forecast prices or provide financial advice.",
    loading: "Loading market context",
    unavailable: "Market context unavailable",
    loadFailed: "News failed to load.",
    analyzeFailed: "Context analysis failed.",
    markets: { crypto: "Crypto", forex: "Forex", stocks: "Global Stocks" } as Record<string, string>,
    importance: { low: "Low", medium: "Medium", high: "High", critical: "Critical" } as Record<string, string>,
    // The server sends the category as a code; the sentiment and disclaimer are already English.
    categories: {
      macro: "Macro",
      central_bank: "Central bank",
      inflation: "Inflation",
      employment: "Employment",
      crypto_regulation: "Crypto regulation",
      exchange_event: "Exchange event",
      earnings: "Earnings",
      company_news: "Company news",
      geopolitical: "Geopolitical",
      risk_event: "Risk event",
      other: "Other"
    } as Record<string, string>,
    sentiments: {} as Record<string, string>,
    disclaimers: {} as Record<string, string>
  },
  fa: {
    eyebrow: "زمینه بازار",
    description: "زمینه دو زبانه فارکس، کریپتو و سهام جهانی را بدون تبدیل خبر به قطعیت بازار مرور کنید.",
    filters: "فیلترهای زمینه",
    filtersDesc: "قبل از تحلیل، بازار، اهمیت، دسته یا کلیدواژه را فیلتر کنید.",
    search: "جست‌وجوی عنوان، خلاصه یا دسته",
    allMarkets: "همه بازارها",
    allImportance: "همه اهمیت‌ها",
    allCategories: "همه دسته‌ها",
    marketFilter: "فیلتر بازار",
    importanceFilter: "فیلتر اهمیت",
    categoryFilter: "فیلتر دسته",
    refresh: "به‌روزرسانی",
    table: "صف زمینه",
    tableDesc: "خبرها و زمینه‌های بازار برای مرور روزانه.",
    columns: { title: "عنوان", market: "بازار", importance: "اهمیت", category: "دسته", source: "منبع" },
    selected: "زمینه انتخاب‌شده",
    selectedDesc: "مورد را بخوانید و تحلیل زمینه را اجرا کنید.",
    noSelection: "موردی انتخاب نشده است.",
    riskNotes: "نکات ریسک",
    analysis: "تحلیل زمینه",
    analysisDesc: "نکات احتیاطی آموزشی و چک‌لیست مرور.",
    analyze: "تحلیل زمینه",
    analyzing: "در حال تحلیل...",
    emptyAnalysis: "یک مورد را انتخاب و تحلیل کنید تا نکات احتیاطی ساختاری نمایش داده شود.",
    whatHappened: "چه اتفاقی افتاد",
    facts: { market: "بازار", impact: "اثر", category: "دسته", language: "زبان" },
    languageValue: "فارسی",
    cautionNotes: "نکات احتیاطی",
    reviewChecklist: "چک‌لیست مرور",
    safety: "تحلیل خبر فقط برای آگاهی و مرور است؛ پیش‌بینی قیمت یا توصیه مالی ارائه نمی‌کند.",
    loading: "در حال بارگذاری زمینه بازار",
    unavailable: "زمینه بازار در دسترس نیست",
    loadFailed: "بارگذاری اخبار ممکن نشد.",
    analyzeFailed: "تحلیل زمینه انجام نشد.",
    markets: { crypto: "کریپتو", forex: "فارکس", stocks: "سهام جهانی" } as Record<string, string>,
    importance: { low: "کم", medium: "متوسط", high: "زیاد", critical: "بحرانی" } as Record<string, string>,
    categories: {
      macro: "اقتصاد کلان",
      central_bank: "بانک مرکزی",
      inflation: "تورم",
      employment: "اشتغال",
      crypto_regulation: "مقررات کریپتو",
      exchange_event: "رویداد صرافی",
      earnings: "گزارش سود شرکت‌ها",
      company_news: "خبر شرکت",
      geopolitical: "ژئوپلیتیک",
      risk_event: "رویداد ریسکی",
      other: "سایر"
    } as Record<string, string>,
    sentiments: { caution: "احتیاط", mixed: "ترکیبی", neutral: "خنثی", positive: "مثبت", negative: "منفی" } as Record<string, string>,
    // The analysis service answers with this fixed English disclaimer.
    disclaimers: {
      "This context analysis is educational. It does not predict direction, provide financial advice, or create market certainty.":
        "این تحلیل زمینه آموزشی است؛ جهت بازار را پیش‌بینی نمی‌کند، توصیه مالی نیست و قطعیت بازار ایجاد نمی‌کند."
    } as Record<string, string>
  }
} as const;

export function NewsScreen({ locale, messages }: { locale: Locale; messages: Messages }) {
  const c = copy[locale];
  const [news, setNews] = useState<NewsItem[]>([]);
  const [analysis, setAnalysis] = useState<NewsAnalysis | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [market, setMarket] = useState("all");
  const [importance, setImportance] = useState("all");
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  const categoryName = (value: string) => c.categories[value] ?? value;
  const marketName = (value: string) => c.markets[value] ?? value;
  // The analysis service writes the market code ("forex") into its Persian sentences; show the market's name instead.
  const localizeNote = (note: string) => (locale === "fa" ? note.replace(/\b(forex|crypto|stocks)\b/g, (code) => marketName(code)) : note);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<{ news: NewsItem[] }>(`/api/news?locale=${locale}`);
      setNews(data.news);
      setSelectedId((current) => current ?? itemId(data.news[0]) ?? null);
      setError(null);
    } catch (err) {
      if (isAuthError(err)) setAuthRequired(true);
      else setError(apiErrorText(err, locale, c.loadFailed));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [locale]);

  const categories = useMemo(() => Array.from(new Set(news.map((item) => item.category))).sort(), [news]);
  const filteredNews = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return news.filter((item) => {
      const matchesMarket = market === "all" || item.market === market;
      const matchesImportance = importance === "all" || item.importance === importance;
      const matchesCategory = category === "all" || item.category === category;
      const haystack = [item.title, item.summary, item.source, item.category, item.sentiment].join(" ").toLowerCase();
      return matchesMarket && matchesImportance && matchesCategory && (!normalized || haystack.includes(normalized));
    });
  }, [category, importance, market, news, query]);

  const selectedItem = useMemo(
    () => news.find((item) => itemId(item) === selectedId) ?? filteredNews[0] ?? null,
    [filteredNews, news, selectedId]
  );

  async function analyze(item: NewsItem) {
    setAnalyzing(true);
    setError(null);
    try {
      const data = await apiFetch<{ analysis: NewsAnalysis }>("/api/news/analyze", {
        method: "POST",
        body: JSON.stringify({ newsItemId: item.id, text: item.summary, language: locale, market: item.market })
      });
      setAnalysis(data.analysis);
      setSelectedId(itemId(item));
    } catch (err) {
      if (isAuthError(err)) setAuthRequired(true);
      else setError(apiErrorText(err, locale, c.analyzeFailed));
    } finally {
      setAnalyzing(false);
    }
  }

  if (loading) return <LoadingState label={c.loading} />;
  if (authRequired) return <AuthRequiredState locale={locale} />;
  if (error && news.length === 0) return <ErrorState title={c.unavailable} description={error} />;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={c.eyebrow} title={t(messages, "pages.news")} description={c.description} />

      <div className="rounded-md border border-warning/30 bg-warning/10 p-4 text-sm leading-6 text-warning">
        <Newspaper className="me-2 inline h-4 w-4" />
        {c.safety}
      </div>

      {error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

      {/* grid-cols-1 and min-w-0: the table scrolls inside its card instead of widening the page on a phone. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_420px]">
        <div className="min-w-0 space-y-4">
          <SectionPanel
            title={c.filters}
            description={c.filtersDesc}
            action={
              <Button variant="secondary" onClick={load} type="button">
                <RefreshCw className="me-2 h-4 w-4" />
                {c.refresh}
              </Button>
            }
          >
            <div className="grid gap-3 lg:grid-cols-[1fr_160px_160px_180px]">
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input className="ps-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={c.search} />
              </div>
              <Select value={market} onChange={(event) => setMarket(event.target.value)} aria-label={c.marketFilter}>
                <option value="all">{c.allMarkets}</option>
                <option value="crypto">{c.markets.crypto}</option>
                <option value="forex">{c.markets.forex}</option>
                <option value="stocks">{c.markets.stocks}</option>
              </Select>
              <Select value={importance} onChange={(event) => setImportance(event.target.value)} aria-label={c.importanceFilter}>
                <option value="all">{c.allImportance}</option>
                <option value="low">{c.importance.low}</option>
                <option value="medium">{c.importance.medium}</option>
                <option value="high">{c.importance.high}</option>
                <option value="critical">{c.importance.critical}</option>
              </Select>
              <Select value={category} onChange={(event) => setCategory(event.target.value)} aria-label={c.categoryFilter}>
                <option value="all">{c.allCategories}</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {categoryName(item)}
                  </option>
                ))}
              </Select>
            </div>
          </SectionPanel>

          <SectionPanel title={c.table} description={c.tableDesc}>
            <DataTable
              rows={filteredNews}
              emptyTitle={t(messages, "common.emptyTitle")}
              emptyDescription={t(messages, "common.emptyDescription")}
              columns={[
                {
                  key: "title",
                  header: c.columns.title,
                  cell: (row) => (
                    <button className="max-w-xl text-start font-semibold text-foreground hover:text-primary" onClick={() => setSelectedId(itemId(row))} type="button">
                      {row.title}
                    </button>
                  )
                },
                { key: "market", header: c.columns.market, cell: (row) => <Badge>{marketName(row.market)}</Badge> },
                { key: "importance", header: c.columns.importance, cell: (row) => <Badge tone={importanceTone(row.importance)}>{c.importance[row.importance] ?? row.importance}</Badge> },
                { key: "category", header: c.columns.category, cell: (row) => categoryName(row.category) },
                { key: "source", header: c.columns.source, cell: (row) => row.source }
              ]}
            />
          </SectionPanel>
        </div>

        <div className="min-w-0 space-y-4">
          <SectionPanel
            title={c.selected}
            description={c.selectedDesc}
            action={
              selectedItem ? (
                <Button variant="secondary" onClick={() => analyze(selectedItem)} disabled={analyzing}>
                  <Filter className="me-2 h-4 w-4" />
                  {analyzing ? c.analyzing : c.analyze}
                </Button>
              ) : null
            }
          >
            {selectedItem ? (
              <div className="space-y-4">
                <div>
                  <p className="text-lg font-semibold leading-7 text-foreground">{selectedItem.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedItem.source} · {marketName(selectedItem.market)} · {categoryName(selectedItem.category)} · {c.sentiments[selectedItem.sentiment] ?? selectedItem.sentiment}
                  </p>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{selectedItem.summary}</p>
                <List title={c.riskNotes} items={selectedItem.riskNotes} tone="warning" />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{c.noSelection}</p>
            )}
          </SectionPanel>

          <SectionPanel title={c.analysis} description={c.analysisDesc}>
            {analysis ? (
              <div className="space-y-4 text-sm">
                <p className="rounded-md border border-warning/30 bg-warning/10 p-3 leading-6 text-warning">{c.disclaimers[analysis.disclaimer] ?? analysis.disclaimer}</p>
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <p className="font-semibold text-foreground">{c.whatHappened}</p>
                  <p className="mt-2 leading-6 text-muted-foreground">{analysis.whatHappened}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <MiniFact label={c.facts.market} value={marketName(analysis.affectedMarket)} />
                  <MiniFact label={c.facts.impact} value={c.importance[analysis.impactLevel] ?? analysis.impactLevel} />
                  <MiniFact label={c.facts.category} value={categoryName(analysis.category)} />
                  <MiniFact label={c.facts.language} value={c.languageValue} />
                </div>
                <List title={c.cautionNotes} items={analysis.cautionNotes.map(localizeNote)} tone="warning" />
                <List title={c.reviewChecklist} items={analysis.reviewChecklist} tone="success" />
              </div>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">{c.emptyAnalysis}</p>
            )}
          </SectionPanel>
        </div>
      </div>
    </div>
  );
}

function itemId(item?: NewsItem | null) {
  if (!item) return null;
  return item.id ?? `${item.title}-${item.source}`;
}

function importanceTone(importance: string): "default" | "success" | "warning" | "danger" {
  if (importance === "critical" || importance === "high") return "warning";
  if (importance === "low") return "default";
  return "success";
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function List({ title, items, tone = "default" }: { title: string; items: string[]; tone?: "default" | "warning" | "success" }) {
  const markerClass = tone === "warning" ? "bg-warning" : tone === "success" ? "bg-success" : "bg-primary";
  return (
    <div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <div className="mt-2 space-y-2">
        {items.map((item) => (
          <div key={item} className="flex gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm leading-6 text-muted-foreground">
            <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${markerClass}`} />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
