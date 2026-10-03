"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Lightbulb, Plus, RefreshCw, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PremiumPanel } from "@/components/ui/premium-panel";
import { Select } from "@/components/ui/select";
import { AuthRequiredState, EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, isAuthError } from "@/lib/api/client";
import { apiErrorText } from "@/lib/api/error-text";
import { t, type getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";
import { splitListInput } from "@/lib/text/split-list";

type Messages = ReturnType<typeof getMessages>;
type IdeaType =
  | "market_observation"
  | "setup_idea"
  | "strategy_improvement"
  | "risk_rule_idea"
  | "lesson_learned"
  | "backtest_idea"
  | "news_context_note";
type IdeaStatus = "draft" | "watching" | "tested" | "converted_to_plan" | "archived";
type Idea = {
  id: string;
  title: string;
  market: "crypto" | "forex" | "stocks";
  symbols: string[];
  type: IdeaType;
  status: IdeaStatus;
  thesis: string;
  invalidation: string | null;
  confidence: number;
  tags: string[];
  updatedAt: string;
};

const typeLabelsByLocale: Record<Locale, Record<IdeaType, string>> = {
  en: {
    market_observation: "Market observation",
    setup_idea: "Setup idea",
    strategy_improvement: "Strategy improvement",
    risk_rule_idea: "Risk rule idea",
    lesson_learned: "Lesson learned",
    backtest_idea: "Backtest idea",
    news_context_note: "News/context note"
  },
  fa: {
    market_observation: "مشاهده بازار",
    setup_idea: "ایده ستاپ",
    strategy_improvement: "بهبود استراتژی",
    risk_rule_idea: "ایده قانون ریسک",
    lesson_learned: "درس آموخته‌شده",
    backtest_idea: "ایده بک‌تست",
    news_context_note: "یادداشت خبر و زمینه"
  }
};

const statusLabelsByLocale: Record<Locale, Record<IdeaStatus, string>> = {
  en: { draft: "Draft", watching: "Watching", tested: "Tested", converted_to_plan: "Converted to plan", archived: "Archived" },
  fa: { draft: "پیش‌نویس", watching: "در حال پیگیری", tested: "آزموده‌شده", converted_to_plan: "تبدیل‌شده به پلن", archived: "بایگانی‌شده" }
};

const copy = {
  en: {
    eyebrow: "Hypothesis vault",
    description: "Capture observations, setup thoughts, strategy improvements, risk rules, lessons, and backtest ideas before they become plans.",
    loading: "Loading ideas",
    unavailable: "Ideas unavailable",
    loadFailed: "The ideas could not be loaded. Reload the page or try again in a moment.",
    saveFailed: "The idea could not be saved. Try again in a moment.",
    allMarkets: "All markets",
    allStatuses: "All statuses",
    create: "Capture idea",
    refresh: "Refresh",
    vault: "Idea vault",
    form: "Fast capture",
    thesis: "Thesis",
    invalidation: "Invalidation",
    title: "Title",
    market: "Market",
    type: "Type",
    status: "Status",
    confidence: "Confidence",
    symbols: "Symbols",
    tags: "Tags",
    saving: "Saving...",
    markets: { crypto: "Crypto", forex: "Forex", stocks: "Global stocks" },
    placeholders: {
      title: "e.g. Range retest observation",
      symbols: "BTCUSDT, ETHUSDT",
      thesis: "What did you notice, and what would you review before planning around it?",
      invalidation: "What would make you drop this idea?",
      tags: "e.g. liquidity, review",
      confidence: "1-10 (5 if blank)"
    },
    noIdeas: "No ideas yet",
    noIdeasDesc: "Capture one observation or lesson to start building your private research memory.",
    search: "Search ideas, symbols, tags",
    privacy: "Private workspace note. This is review context, not a trade instruction."
  },
  fa: {
    eyebrow: "مخزن فرضیه‌ها",
    description: "مشاهده‌ها، فکرهای ستاپ، بهبود استراتژی، قوانین ریسک، درس‌ها و ایده‌های بک‌تست را پیش از تبدیل به پلن ثبت کنید.",
    loading: "در حال بارگذاری ایده‌ها",
    unavailable: "ایده‌ها در دسترس نیستند",
    loadFailed: "بارگذاری ایده‌ها ممکن نشد. صفحه را دوباره باز کنید یا چند لحظه بعد تلاش کنید.",
    saveFailed: "ذخیره ایده انجام نشد. چند لحظه بعد دوباره تلاش کنید.",
    allMarkets: "همه بازارها",
    allStatuses: "همه وضعیت‌ها",
    create: "ثبت ایده",
    refresh: "به‌روزرسانی",
    vault: "مخزن ایده",
    form: "ثبت سریع",
    thesis: "فرضیه",
    invalidation: "ابطال",
    title: "عنوان",
    market: "بازار",
    type: "نوع",
    status: "وضعیت",
    confidence: "اطمینان",
    symbols: "نمادها",
    tags: "برچسب‌ها",
    saving: "در حال ذخیره...",
    markets: { crypto: "کریپتو", forex: "فارکس", stocks: "سهام جهانی" },
    placeholders: {
      title: "مثلاً مشاهده بازگشت به محدوده",
      symbols: "BTCUSDT, ETHUSDT",
      thesis: "چه چیزی دیدید و پیش از برنامه‌ریزی چه چیزی را مرور می‌کنید؟",
      invalidation: "چه چیزی باعث می‌شود این ایده را کنار بگذارید؟",
      tags: "مثلاً نقدینگی، مرور",
      confidence: "۱ تا ۱۰ (اگر خالی بماند ۵)"
    },
    noIdeas: "هنوز ایده‌ای نیست",
    noIdeasDesc: "برای ساخت حافظه پژوهشی خصوصی، یک مشاهده یا درس ثبت کنید.",
    search: "جستجوی ایده، نماد یا برچسب",
    privacy: "یادداشت خصوصی محیط کار. این متن زمینه مرور است، نه دستور معامله."
  }
} as const;

export function IdeasScreen({ locale, messages }: { locale: Locale; messages: Messages }) {
  const c = copy[locale];
  const typeLabels = typeLabelsByLocale[locale];
  const statusLabels = statusLabelsByLocale[locale];
  const fieldLabels: Record<string, string> = {
    title: c.title,
    market: c.market,
    symbols: c.symbols,
    type: c.type,
    status: c.status,
    thesis: c.thesis,
    invalidation: c.invalidation,
    confidence: c.confidence,
    tags: c.tags
  };
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<IdeaStatus | "all">("all");
  const [market, setMarket] = useState<Idea["market"] | "all">("all");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // A failed save stays next to the form; the page-level error card is for a list that could not be loaded.
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<{ ideas: Idea[] }>("/api/ideas");
      setIdeas(data.ideas);
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

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return ideas.filter((idea) => {
      const haystack = [idea.title, idea.thesis, ...idea.symbols, ...idea.tags].join(" ").toLowerCase();
      return (status === "all" || idea.status === status) && (market === "all" || idea.market === market) && (!normalized || haystack.includes(normalized));
    });
  }, [ideas, market, query, status]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // React clears event.currentTarget once the handler returns its promise, so take the form before awaiting.
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setSubmitting(true);
    setError(null);
    setFormError(null);
    try {
      await apiFetch("/api/ideas", {
        method: "POST",
        body: JSON.stringify({
          title: form.get("title"),
          market: form.get("market"),
          symbols: splitList(form.get("symbols")),
          type: form.get("type"),
          status: form.get("status"),
          thesis: form.get("thesis"),
          invalidation: nullable(form.get("invalidation")),
          // Blank means "use the server default", not zero.
          confidence: nullable(form.get("confidence")) ?? undefined,
          tags: splitList(form.get("tags"))
        })
      });
      formEl.reset();
      await load();
    } catch (err) {
      if (isAuthError(err)) setError(err);
      else setFormError(apiErrorText(err, locale, c.saveFailed, fieldLabels));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState label={c.loading} />;
  if (error && isAuthError(error)) return <AuthRequiredState locale={locale} />;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={c.eyebrow} title={t(messages, "pages.ideas")} description={c.description} />
      {error && !isAuthError(error) ? <ErrorState title={c.unavailable} description={apiErrorText(error, locale, c.loadFailed)} /> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <PremiumPanel className="p-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-3 size-4 text-muted-foreground" aria-hidden="true" />
                <Input className="ps-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={c.search} />
              </div>
              <Select value={market} onChange={(event) => setMarket(event.target.value as Idea["market"] | "all")}>
                <option value="all">{c.allMarkets}</option>
                <option value="forex">{c.markets.forex}</option>
                <option value="crypto">{c.markets.crypto}</option>
                <option value="stocks">{c.markets.stocks}</option>
              </Select>
              <Select value={status} onChange={(event) => setStatus(event.target.value as IdeaStatus | "all")}>
                <option value="all">{c.allStatuses}</option>
                {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
              <Button type="button" variant="secondary" onClick={load}>
                <RefreshCw className="me-2 size-4" aria-hidden="true" />
                {c.refresh}
              </Button>
            </div>
          </PremiumPanel>

          {filtered.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {filtered.map((idea) => (
                <PremiumPanel key={idea.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{idea.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{typeLabels[idea.type]}</p>
                    </div>
                    <Badge tone={idea.market === "crypto" ? "warning" : idea.market === "forex" ? "success" : "default"}>{c.markets[idea.market]}</Badge>
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{idea.thesis}</p>
                  {idea.invalidation ? <p className="mt-3 text-xs leading-5 text-warning">{c.invalidation}: {idea.invalidation}</p> : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge>{statusLabels[idea.status]}</Badge>
                    <Badge tone="success">{idea.confidence}/10</Badge>
                    {idea.symbols.map((symbol) => <Badge key={symbol}>{symbol}</Badge>)}
                  </div>
                </PremiumPanel>
              ))}
            </div>
          ) : (
            <EmptyState title={c.noIdeas} description={c.noIdeasDesc} />
          )}
        </div>

        <PremiumPanel glow className="p-5">
          <div className="flex items-center gap-2">
            <Lightbulb className="size-5 text-primary" aria-hidden="true" />
            <h2 className="text-base font-semibold">{c.form}</h2>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{c.privacy}</p>
          <form className="mt-5 grid gap-4" onSubmit={submit}>
            <Field label={`${c.title} *`}>
              <Input name="title" placeholder={c.placeholders.title} required minLength={2} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={c.market}>
                <Select name="market" defaultValue="crypto">
                  <option value="crypto">{c.markets.crypto}</option>
                  <option value="forex">{c.markets.forex}</option>
                  <option value="stocks">{c.markets.stocks}</option>
                </Select>
              </Field>
              <Field label={c.type}>
                <Select name="type" defaultValue="market_observation">
                  {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={c.status}>
                <Select name="status" defaultValue="draft">
                  {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </Field>
              <Field label={c.confidence}>
                <Input name="confidence" placeholder={c.placeholders.confidence} inputMode="numeric" />
              </Field>
            </div>
            <Field label={c.symbols}>
              <Input name="symbols" placeholder={c.placeholders.symbols} />
            </Field>
            <Field label={`${c.thesis} *`}>
              <Textarea name="thesis" className="min-h-28" placeholder={c.placeholders.thesis} required minLength={5} />
            </Field>
            <Field label={c.invalidation}>
              <Textarea name="invalidation" className="min-h-20" placeholder={c.placeholders.invalidation} />
            </Field>
            <Field label={c.tags}>
              <Input name="tags" placeholder={c.placeholders.tags} />
            </Field>
            {formError ? (
              <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {formError}
              </p>
            ) : null}
            <Button disabled={submitting}>
              <Plus className="me-2 size-4" aria-hidden="true" />
              {submitting ? c.saving : c.create}
            </Button>
          </form>
        </PremiumPanel>
      </div>
    </div>
  );
}

const splitList = splitListInput;

function nullable(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}
