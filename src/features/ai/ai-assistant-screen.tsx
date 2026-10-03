"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Brain, FileText, GraduationCap, Newspaper, ShieldAlert, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { InsightCard } from "@/components/ui/insight-card";
import { Input } from "@/components/ui/input";
import { SafeAIMessage } from "@/components/ui/safe-ai-message";
import { SectionPanel } from "@/components/ui/section-panel";
import { Select } from "@/components/ui/select";
import { AuthRequiredState } from "@/components/ui/state";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, isAuthError } from "@/lib/api/client";
import { apiErrorText } from "@/lib/api/error-text";
import { t, type getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";

type Messages = ReturnType<typeof getMessages>;
type AiMode = "professional_coach" | "learning";
type Workflow = "trade" | "journal" | "weekly" | "strategy" | "news";
type AiOutput = {
  disclaimer: string;
  mode: AiMode;
  summary: string;
  observations: string[];
  risks: string[];
  nextActions: string[];
};

const copy = {
  en: {
    eyebrow: "AI coach",
    description: "The coach reviews your trades, rules and journal to find behavior patterns, repeated mistakes and areas to improve.",
    privacy:
      "Reviews run on the coach's built-in rules, so your journal is not sent to an outside AI service unless the site operator has set one up. If they have, only summary figures and the trade details you type here are shared.",
    safety: "AI output is educational analytics only. It does not provide personalized financial advice, profit expectations, or market certainty.",
    mode: "Mode",
    professional: "Professional trading coach",
    learning: "Learning assistant",
    reviewTrade: "Review journal trade",
    reviewing: "Reviewing...",
    symbol: "Symbol",
    side: "Side",
    sides: { long: "Long", short: "Short" },
    entryPrice: "Entry price",
    exitPrice: "Exit price",
    stopLoss: "Stop loss",
    takeProfit: "Take profit",
    context: "Journal context",
    placeholders: {
      symbol: "BTCUSDT",
      entryPrice: "65000",
      exitPrice: "66000",
      stopLoss: "64000",
      takeProfit: "67000",
      context: "What was the plan, and what happened? Optional."
    },
    run: "Run workflow",
    trade: "Trade review",
    journal: "Journal reviewer",
    weekly: "Weekly review coach",
    strategy: "Strategy reviewer",
    news: "News context summarizer",
    output: "Assistant output",
    outputDesc: "What the coach found, as observations, risks and next actions.",
    empty: "Nothing here yet. Run a workflow to see the coach's observations, risks and next actions. It works best once you have closed trades in your journal.",
    importTrades: "Import MT5 trades",
    logTrade: "Log a trade in the journal",
    workflows: "Coach workflows",
    workflowsDesc: "Switch between focused review modes without leaving the page.",
    summaryTitle: "Summary",
    observationsTitle: "Observations",
    risksTitle: "Risks",
    nextActionsTitle: "Next actions",
    failed: "AI workflow failed",
    workflowDescriptions: {
      trade: "Review one trade with price levels and notes.",
      journal: "Summarize journal metrics and recurring behavior.",
      weekly: "Create a weekly process review from the current journal.",
      strategy: "Review strategy structure and checklist quality.",
      news: "Summarize the news backdrop of the market for risk awareness."
    }
  },
  fa: {
    eyebrow: "مربی هوش مصنوعی",
    description: "مربی، معاملات، قوانین و ژورنال شما را بررسی می‌کند تا الگوهای رفتاری، اشتباه‌های تکراری و نقاط قابل بهبود را پیدا کند.",
    privacy:
      "مرورها با قواعد داخلی مربی انجام می‌شود و ژورنال شما به هیچ سرویس هوش مصنوعی بیرونی فرستاده نمی‌شود، مگر اینکه مدیر سایت چنین سرویسی را راه‌اندازی کرده باشد. در آن صورت فقط آمار خلاصه و جزئیات معامله‌ای که همین‌جا وارد می‌کنید ارسال می‌شود.",
    safety: "خروجی هوش مصنوعی فقط تحلیل آموزشی است و توصیه مالی شخصی، انتظار سود یا قطعیت بازار ارائه نمی‌کند.",
    mode: "حالت",
    professional: "مربی حرفه‌ای معامله",
    learning: "دستیار یادگیری",
    reviewTrade: "مرور معامله ژورنال",
    reviewing: "در حال مرور...",
    symbol: "نماد",
    side: "سمت",
    sides: { long: "لانگ", short: "شورت" },
    entryPrice: "قیمت ورود",
    exitPrice: "قیمت خروج",
    stopLoss: "حد ضرر",
    takeProfit: "حد سود",
    context: "یادداشت معامله",
    placeholders: {
      symbol: "BTCUSDT",
      entryPrice: "65000",
      exitPrice: "66000",
      stopLoss: "64000",
      takeProfit: "67000",
      context: "پلن چه بود و چه اتفاقی افتاد؟ اختیاری."
    },
    run: "اجرای گردش‌کار",
    trade: "مرور معامله",
    journal: "بازبین ژورنال",
    weekly: "مربی مرور هفتگی",
    strategy: "بازبین استراتژی",
    news: "خلاصه شرایط خبری",
    output: "خروجی دستیار",
    outputDesc: "آنچه مربی پیدا کرد، در قالب مشاهده‌ها، ریسک‌ها و اقدامات بعدی.",
    empty: "هنوز چیزی نیست. یک گردش‌کار را اجرا کنید تا مشاهده‌ها، ریسک‌ها و اقدامات بعدی مربی را ببینید. مربی وقتی معامله‌های بسته‌شده در ژورنال دارید بهتر کار می‌کند.",
    importTrades: "ورود معاملات MT5",
    logTrade: "ثبت معامله در ژورنال",
    workflows: "گردش‌کارهای مربی",
    workflowsDesc: "بدون ترک صفحه بین حالت‌های مرور متمرکز جابه‌جا شوید.",
    summaryTitle: "خلاصه",
    observationsTitle: "مشاهده‌ها",
    risksTitle: "ریسک‌ها",
    nextActionsTitle: "اقدامات بعدی",
    failed: "اجرای گردش‌کار انجام نشد",
    workflowDescriptions: {
      trade: "یک معامله را با سطوح قیمت و یادداشت‌ها مرور کنید.",
      journal: "معیارهای ژورنال و رفتارهای تکراری را خلاصه کنید.",
      weekly: "یک مرور فرایند هفتگی از ژورنال فعلی بسازید.",
      strategy: "ساختار استراتژی و کیفیت چک‌لیست را مرور کنید.",
      news: "شرایط خبری بازار را برای آگاهی از ریسک خلاصه کنید."
    }
  }
} as const;

const workflows: Array<{ key: Workflow; icon: typeof Brain; endpoint: string; resultKey: "review" | "insights" | "summary"; labelKey: Workflow }> = [
  { key: "trade", icon: Brain, endpoint: "/api/ai/review-trade", resultKey: "review", labelKey: "trade" },
  { key: "journal", icon: FileText, endpoint: "/api/ai/journal-insights", resultKey: "insights", labelKey: "journal" },
  { key: "weekly", icon: ShieldAlert, endpoint: "/api/ai/weekly-review", resultKey: "review", labelKey: "weekly" },
  { key: "strategy", icon: GraduationCap, endpoint: "/api/ai/strategy-review", resultKey: "review", labelKey: "strategy" },
  { key: "news", icon: Newspaper, endpoint: "/api/ai/news-summary", resultKey: "summary", labelKey: "news" }
];

export function AiAssistantScreen({ locale, messages }: { locale: Locale; messages: Messages }) {
  const c = copy[locale];
  const [output, setOutput] = useState<AiOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow>("trade");
  const [mode, setMode] = useState<AiMode>("professional_coach");
  const [loadingWorkflow, setLoadingWorkflow] = useState<Workflow | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  async function reviewTrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runWorkflow("trade", {
      symbol: form.get("symbol"),
      mode,
      side: form.get("side"),
      entryPrice: form.get("entryPrice"),
      exitPrice: emptyToNull(form.get("exitPrice")),
      stopLoss: emptyToNull(form.get("stopLoss")),
      takeProfit: emptyToNull(form.get("takeProfit")),
      notes: form.get("notes"),
      locale
    });
  }

  async function runWorkflow(workflow: Workflow, body?: Record<string, unknown>) {
    const meta = workflows.find((item) => item.key === workflow);
    if (!meta) return;

    setError(null);
    setLoadingWorkflow(workflow);
    try {
      const data = await apiFetch<Record<string, AiOutput>>(meta.endpoint, {
        method: "POST",
        body: JSON.stringify(body ?? { mode, locale })
      });
      setOutput(data[meta.resultKey]);
      setActiveWorkflow(workflow);
    } catch (err) {
      if (isAuthError(err)) setAuthRequired(true);
      else {
        setError(
          apiErrorText(err, locale, c.failed, {
            symbol: c.symbol,
            entryPrice: c.entryPrice,
            exitPrice: c.exitPrice,
            stopLoss: c.stopLoss,
            takeProfit: c.takeProfit
          })
        );
      }
    } finally {
      setLoadingWorkflow(null);
    }
  }

  if (authRequired) return <AuthRequiredState locale={locale} />;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={c.eyebrow} title={t(messages, "pages.ai")} description={c.description} />

      <SafeAIMessage>{c.safety}</SafeAIMessage>
      <p className="text-sm leading-6 text-muted-foreground">{c.privacy}</p>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <SectionPanel title={c.workflows} description={c.workflowsDesc}>
            <div className="grid gap-3 md:grid-cols-5">
              {workflows.map((workflow) => {
                const Icon = workflow.icon;
                return (
                  <button
                    key={workflow.key}
                    type="button"
                    onClick={() => setActiveWorkflow(workflow.key)}
                    className={`rounded-md border p-3 text-start transition ${
                      activeWorkflow === workflow.key ? "border-primary bg-primary/10 text-foreground" : "border-border bg-muted/30 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="mb-2 h-4 w-4" />
                    <span className="block text-sm font-semibold">{c[workflow.labelKey]}</span>
                  </button>
                );
              })}
            </div>
          </SectionPanel>

          <SectionPanel title={activeWorkflow === "trade" ? c.reviewTrade : c[workflowLabel(activeWorkflow)]} description={c.workflowDescriptions[activeWorkflow]}>
            <div className="mb-4 max-w-sm">
              <Field label={c.mode}>
                <Select value={mode} onChange={(event) => setMode(event.target.value as AiMode)}>
                  <option value="professional_coach">{c.professional}</option>
                  <option value="learning">{c.learning}</option>
                </Select>
              </Field>
            </div>

            {activeWorkflow === "trade" ? (
              <form className="grid gap-4 md:grid-cols-2" onSubmit={reviewTrade}>
                <Field label={`${c.symbol} *`}>
                  <Input name="symbol" placeholder={c.placeholders.symbol} required />
                </Field>
                <Field label={c.side}>
                  <Select name="side" defaultValue="long">
                    <option value="long">{c.sides.long}</option>
                    <option value="short">{c.sides.short}</option>
                  </Select>
                </Field>
                <Field label={`${c.entryPrice} *`}>
                  <Input name="entryPrice" placeholder={c.placeholders.entryPrice} inputMode="decimal" required />
                </Field>
                <Field label={c.exitPrice}>
                  <Input name="exitPrice" placeholder={c.placeholders.exitPrice} inputMode="decimal" />
                </Field>
                <Field label={c.stopLoss}>
                  <Input name="stopLoss" placeholder={c.placeholders.stopLoss} inputMode="decimal" />
                </Field>
                <Field label={c.takeProfit}>
                  <Input name="takeProfit" placeholder={c.placeholders.takeProfit} inputMode="decimal" />
                </Field>
                <Field label={c.context}>
                  <Textarea name="notes" className="min-h-32" placeholder={c.placeholders.context} />
                </Field>
                <div className="flex items-end">
                  <Button disabled={loadingWorkflow === "trade"}>
                    <Brain className="me-2 h-4 w-4" />
                    {loadingWorkflow === "trade" ? c.reviewing : c.reviewTrade}
                  </Button>
                </div>
              </form>
            ) : (
              <Button onClick={() => runWorkflow(activeWorkflow)} disabled={loadingWorkflow === activeWorkflow}>
                <Sparkles className="me-2 h-4 w-4" />
                {loadingWorkflow === activeWorkflow ? c.reviewing : c.run}
              </Button>
            )}
          </SectionPanel>
        </div>

        <SectionPanel title={c.output} description={c.outputDesc}>
          <div className="space-y-4">
            {error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
            {output ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="success">{output.mode === "learning" ? c.learning : c.professional}</Badge>
                </div>
                <SafeAIMessage>{output.disclaimer}</SafeAIMessage>
                <InsightCard title={c.summaryTitle}>{output.summary}</InsightCard>
                <List title={c.observationsTitle} items={output.observations} />
                <List title={c.risksTitle} items={output.risks} tone="warning" />
                <List title={c.nextActionsTitle} items={output.nextActions} tone="success" />
              </>
            ) : (
              <div className="space-y-4">
                <p className="text-sm leading-6 text-muted-foreground">{c.empty}</p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href={`/${locale}/import`}
                    className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
                  >
                    {c.importTrades}
                  </Link>
                  <Link
                    href={`/${locale}/journal`}
                    className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold text-foreground transition hover:bg-muted"
                  >
                    {c.logTrade}
                  </Link>
                </div>
              </div>
            )}
          </div>
        </SectionPanel>
      </div>
    </div>
  );
}

function workflowLabel(workflow: Workflow): "journal" | "weekly" | "strategy" | "news" | "trade" {
  return workflow;
}

function emptyToNull(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
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
