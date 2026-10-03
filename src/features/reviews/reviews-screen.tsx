"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BellPlus, CheckCircle2, ClipboardCheck, FileCheck2, ListChecks, RefreshCw, RotateCcw, ShieldCheck, SkipForward, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionPanel } from "@/components/ui/section-panel";
import { StatCard } from "@/components/ui/stat-card";
import { AuthRequiredState, EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, isAuthError } from "@/lib/api/client";
import { apiErrorText } from "@/lib/api/error-text";
import { formatMoney, formatPercent } from "@/lib/i18n/format";
import { t, type getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

type Messages = ReturnType<typeof getMessages>;
type ReviewType = "daily" | "weekly" | "mistake" | "risk" | "strategy";
type ReviewStatus = "open" | "completed" | "skipped";
type ChecklistItem = {
  key: string;
  label: string;
  completed: boolean;
  note?: string;
};
type Review = {
  id: string;
  type: ReviewType;
  status: ReviewStatus;
  periodStart: string;
  periodEnd: string;
  title: string;
  checklist: ChecklistItem[] | unknown;
  metrics: Record<string, unknown> | null;
  insights: string[];
  risks: string[];
  lessons: string[];
  nextActions: string[];
  linkedTradeIds: string[];
  linkedStrategyIds: string[];
  completedAt: string | null;
  updatedAt: string;
};
type ReviewFocus = {
  review: Review | null;
  overdueCount: number;
  suggestedType: ReviewType;
};

const tabs: { type: ReviewType; icon: typeof FileCheck2 }[] = [
  { type: "daily", icon: ClipboardCheck },
  { type: "weekly", icon: FileCheck2 },
  { type: "mistake", icon: ListChecks },
  { type: "risk", icon: ShieldCheck },
  { type: "strategy", icon: RotateCcw }
];

const copy = {
  en: {
    eyebrow: "Review engine",
    description: "Turn journal records, risk defaults, and strategy notes into a repeatable second-brain review rhythm.",
    generate: "Generate review",
    generating: "Generating...",
    reminder: "Create reminder",
    reminderCreated: "Reminder created",
    complete: "Complete",
    completeAndCarry: "Complete + carry forward",
    carryForwardCreated: "Next daily review created from this review.",
    skip: "Skip",
    delete: "Delete",
    refresh: "Refresh",
    open: "Open",
    completed: "Completed",
    skipped: "Skipped",
    overdue: "Overdue",
    checklist: "Checklist",
    insights: "Insights",
    risks: "Risk notes",
    lessons: "Lessons",
    nextActions: "Next actions",
    notesPlaceholder: "Write a lesson or next action, then save it to this review.",
    addLesson: "Add lesson",
    addAction: "Add action",
    emptyTitle: "No reviews yet",
    emptyDescription:
      "Reviews you generate appear here: a checklist, insights from your records, risk notes and the lessons you write. They are most useful once you have trades in your journal, so import your MT5 trades or log one first.",
    noRecords: "No records yet.",
    importTrades: "Import MT5 trades",
    logTrade: "Log a trade in the journal",
    generateHint: "Generate a daily, weekly, mistake, risk, or strategy review to start the workflow.",
    loading: "Loading reviews",
    failed: "Review workflow failed",
    unavailable: "Reviews unavailable",
    progress: "Checklist progress",
    records: "Linked records",
    ruleBreaks: "Rule breaks",
    drawdown: "Max drawdown",
    period: "Period",
    noSelected: "Select or generate a review to inspect the detail panel.",
    protectedCopy: "Reviews are private workspace records. Sign in to generate and complete them.",
    tabs: {
      daily: "Daily",
      weekly: "Weekly",
      mistake: "Mistakes",
      risk: "Risk",
      strategy: "Strategy"
    }
  },
  fa: {
    eyebrow: "موتور مرور",
    description: "رکوردهای ژورنال، پیش‌فرض‌های ریسک و یادداشت‌های استراتژی را به یک ریتم مرور قابل تکرار تبدیل کنید.",
    generate: "ایجاد مرور",
    generating: "در حال ایجاد...",
    reminder: "ساخت یادآور",
    reminderCreated: "یادآور ساخته شد",
    complete: "تکمیل",
    completeAndCarry: "تکمیل و انتقال به مرور بعدی",
    carryForwardCreated: "مرور روزانه بعدی از خروجی این مرور ساخته شد.",
    skip: "رد کردن",
    delete: "حذف",
    refresh: "به‌روزرسانی",
    open: "باز",
    completed: "تکمیل‌شده",
    skipped: "ردشده",
    overdue: "عقب‌افتاده",
    checklist: "چک‌لیست",
    insights: "بینش‌ها",
    risks: "یادداشت‌های ریسک",
    lessons: "درس‌ها",
    nextActions: "اقدام‌های بعدی",
    notesPlaceholder: "یک درس یا اقدام بعدی بنویسید و آن را در همین مرور ذخیره کنید.",
    addLesson: "افزودن درس",
    addAction: "افزودن اقدام",
    emptyTitle: "هنوز مروری ساخته نشده",
    emptyDescription:
      "مرورهایی که می‌سازید اینجا نمایش داده می‌شوند: چک‌لیست، بینش‌هایی از رکوردهای شما، یادداشت‌های ریسک و درس‌هایی که می‌نویسید. مرور وقتی مفیدتر است که معامله‌ای در ژورنال داشته باشید؛ برای شروع، معامله‌های MT5 را وارد کنید یا یک معامله در ژورنال ثبت کنید.",
    noRecords: "هنوز موردی ثبت نشده است.",
    importTrades: "ورود معاملات MT5",
    logTrade: "ثبت معامله در ژورنال",
    generateHint: "برای شروع، یک مرور روزانه، هفتگی، خطا، ریسک یا استراتژی ایجاد کنید.",
    loading: "در حال بارگذاری مرورها",
    failed: "اجرای مرور انجام نشد",
    unavailable: "مرورها در دسترس نیست",
    progress: "پیشرفت چک‌لیست",
    records: "رکوردهای مرتبط",
    ruleBreaks: "نقض قوانین",
    drawdown: "بیشترین افت",
    period: "بازه",
    noSelected: "یک مرور را انتخاب یا ایجاد کنید تا جزئیات آن نمایش داده شود.",
    protectedCopy: "مرورها رکوردهای خصوصی محیط کار هستند. برای ایجاد و تکمیل آن‌ها وارد شوید.",
    tabs: {
      daily: "روزانه",
      weekly: "هفتگی",
      mistake: "خطاها",
      risk: "ریسک",
      strategy: "استراتژی"
    }
  }
} as const;

export function ReviewsScreen({ locale, messages }: { locale: Locale; messages: Messages }) {
  const c = copy[locale];
  const [reviews, setReviews] = useState<Review[]>([]);
  const [focus, setFocus] = useState<ReviewFocus | null>(null);
  const [activeType, setActiveType] = useState<ReviewType>("daily");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);

  async function load() {
    setLoading(true);
    try {
      const result = await apiFetch<{ reviews: Review[]; focus: ReviewFocus }>("/api/reviews");
      setReviews(result.reviews);
      setFocus(result.focus);
      setSelectedId((current) => current ?? result.focus.review?.id ?? result.reviews[0]?.id ?? null);
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

  const filtered = useMemo(() => reviews.filter((review) => review.type === activeType), [activeType, reviews]);
  const selected = useMemo(
    () => reviews.find((review) => review.id === selectedId) ?? filtered[0] ?? focus?.review ?? null,
    [filtered, focus?.review, reviews, selectedId]
  );
  const selectedChecklist = toChecklist(selected?.checklist);
  const progress = checklistProgress(selectedChecklist);
  const openCount = reviews.filter((review) => review.status === "open").length;
  const completedCount = reviews.filter((review) => review.status === "completed").length;
  const overdueCount = focus?.overdueCount ?? 0;

  async function generate(type = activeType) {
    setBusy(`generate:${type}`);
    setStatus(null);
    setError(null);
    try {
      const result = await apiFetch<{ review: Review; reminder: unknown | null }>("/api/reviews/generate", {
        method: "POST",
        body: JSON.stringify({ type, createReminder: true, locale })
      });
      setReviews((current) => [result.review, ...current]);
      setSelectedId(result.review.id);
      setActiveType(result.review.type);
      if (result.reminder) setStatus(c.reminderCreated);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function update(
    input: Partial<Pick<Review, "status" | "checklist" | "lessons" | "nextActions" | "completedAt">> & { id: string; carryForward?: boolean }
  ) {
    setBusy(`update:${input.id}`);
    setStatus(null);
    setError(null);
    try {
      const result = await apiFetch<{ review: Review; carryForwardReview: Review | null }>("/api/reviews", {
        method: "PATCH",
        body: JSON.stringify({ ...input, locale })
      });
      setReviews((current) => upsertReview(upsertReview(current, result.review), result.carryForwardReview));
      if (result.carryForwardReview) {
        setSelectedId(result.carryForwardReview.id);
        setActiveType(result.carryForwardReview.type);
        setFocus((current) => ({ review: result.carryForwardReview, overdueCount: current?.overdueCount ?? 0, suggestedType: current?.suggestedType ?? "daily" }));
        setStatus(c.carryForwardCreated);
      } else {
        setSelectedId(result.review.id);
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function remove(review: Review) {
    setBusy(`delete:${review.id}`);
    setStatus(null);
    setError(null);
    try {
      await apiFetch("/api/reviews", {
        method: "DELETE",
        body: JSON.stringify({ id: review.id })
      });
      setReviews((current) => current.filter((item) => item.id !== review.id));
      setSelectedId(null);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function createReminder(review: Review) {
    setBusy(`reminder:${review.id}`);
    setStatus(null);
    setError(null);
    try {
      await apiFetch(`/api/reviews/${review.id}/reminder`, { method: "POST", body: JSON.stringify({ locale }) });
      setStatus(c.reminderCreated);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  function toggleChecklist(item: ChecklistItem) {
    if (!selected) return;
    const nextChecklist = selectedChecklist.map((current) =>
      current.key === item.key ? { ...current, completed: !current.completed } : current
    );
    void update({ id: selected.id, checklist: nextChecklist });
  }

  function addNote(kind: "lesson" | "action") {
    if (!selected || note.trim().length === 0) return;
    const text = note.trim();
    setNote("");
    if (kind === "lesson") {
      void update({ id: selected.id, lessons: [...selected.lessons, text] });
    } else {
      void update({ id: selected.id, nextActions: [...selected.nextActions, text] });
    }
  }

  if (loading) return <LoadingState label={c.loading} locale={locale} />;
  if (error && isAuthError(error)) return <AuthRequiredState locale={locale} description={c.protectedCopy} />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={c.eyebrow}
        title={t(messages, "pages.reviews")}
        description={c.description}
        action={
          <Button type="button" onClick={() => generate()} disabled={busy?.startsWith("generate")}>
            <FileCheck2 className="me-2 size-4" aria-hidden="true" />
            {busy?.startsWith("generate") ? c.generating : c.generate}
          </Button>
        }
      />

      {error ? <ErrorState title={c.unavailable} description={apiErrorText(error, locale, c.failed)} /> : null}
      {status ? <p className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">{status}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label={c.open} value={String(openCount)} tone={openCount > 0 ? "warning" : "success"} compact />
        <StatCard label={c.completed} value={String(completedCount)} compact />
        <StatCard label={c.overdue} value={String(overdueCount)} tone={overdueCount > 0 ? "danger" : "success"} compact />
        <StatCard label={c.progress} value={`${Math.round(progress * 100)}%`} compact />
      </div>

      <div className="grid gap-4 xl:grid-cols-[390px_minmax(0,1fr)]">
        <SectionPanel
          title={t(messages, "pages.reviews")}
          description={c.generateHint}
          action={
            <Button type="button" variant="secondary" onClick={load} disabled={busy !== null}>
              <RefreshCw className="me-2 size-4" aria-hidden="true" />
              {c.refresh}
            </Button>
          }
        >
          <div className="grid grid-cols-5 gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeType === tab.type;
              return (
                <button
                  key={tab.type}
                  type="button"
                  onClick={() => {
                    setActiveType(tab.type);
                    setSelectedId(reviews.find((review) => review.type === tab.type)?.id ?? null);
                  }}
                  className={cn(
                    "flex min-h-16 flex-col items-center justify-center gap-1 rounded-md border border-border bg-muted/20 px-2 text-[11px] font-semibold text-muted-foreground transition",
                    active && "border-primary/50 bg-primary/10 text-primary"
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  <span>{c.tabs[tab.type]}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 space-y-2">
            {filtered.length ? (
              filtered.map((review) => (
                <button
                  key={review.id}
                  type="button"
                  onClick={() => setSelectedId(review.id)}
                  className={cn(
                    "w-full rounded-md border border-border bg-muted/20 p-3 text-start transition hover:border-primary/40 hover:bg-primary/5",
                    selected?.id === review.id && "border-primary/50 bg-primary/10"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="line-clamp-1 text-sm font-semibold text-foreground">{review.title}</p>
                    <StatusBadge status={review.status} labels={c} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {c.period}: {dateRange(review.periodStart, review.periodEnd, locale)}
                  </p>
                </button>
              ))
            ) : (
              <EmptyState
                title={c.emptyTitle}
                description={c.emptyDescription}
                actions={[
                  { href: `/${locale}/import`, label: c.importTrades },
                  { href: `/${locale}/journal`, label: c.logTrade }
                ]}
              />
            )}
          </div>
        </SectionPanel>

        <SectionPanel
          title={selected?.title ?? c.noSelected}
          description={selected ? `${c.period}: ${dateRange(selected.periodStart, selected.periodEnd, locale)}` : c.generateHint}
          action={
            selected ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => createReminder(selected)} disabled={busy === `reminder:${selected.id}`}>
                  <BellPlus className="me-2 size-4" aria-hidden="true" />
                  {c.reminder}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => update({ id: selected.id, status: "completed", completedAt: new Date().toISOString(), carryForward: true })}
                  disabled={busy === `update:${selected.id}`}
                >
                  <CheckCircle2 className="me-2 size-4" aria-hidden="true" />
                  {c.completeAndCarry}
                </Button>
              </div>
            ) : null
          }
        >
          {selected ? (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-4">
                <MiniMetric label={c.progress} value={`${Math.round(progress * 100)}%`} />
                <MiniMetric label={c.records} value={String(selected.linkedTradeIds.length + selected.linkedStrategyIds.length)} />
                <MiniMetric label={c.ruleBreaks} value={String(numberMetric(selected.metrics, "ruleBreaks"))} tone={numberMetric(selected.metrics, "ruleBreaks") > 0 ? "danger" : "success"} />
                <MiniMetric
                  label={c.drawdown}
                  value={
                    selected.metrics && "maxDrawdownAmount" in selected.metrics
                      ? numberMetric(selected.metrics, "maxDrawdownAmount") === 0 && numberMetric(selected.metrics, "maxDrawdownR") > 0
                        ? `${numberMetric(selected.metrics, "maxDrawdownR").toFixed(1)}R`
                        : formatMoney(numberMetric(selected.metrics, "maxDrawdownAmount"), locale)
                      : formatPercent(numberMetric(selected.metrics, "maxDrawdown"), locale)
                  }
                  tone="warning"
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
                <div className="space-y-4">
                  <ReviewBlock title={c.checklist}>
                    <div className="space-y-2">
                      {selectedChecklist.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => toggleChecklist(item)}
                          className="flex w-full items-start gap-3 rounded-md border border-border bg-background/50 p-3 text-start transition hover:border-primary/40"
                        >
                          <span
                            className={cn(
                              "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-sm border",
                              item.completed ? "border-success bg-success text-background" : "border-border bg-muted/30"
                            )}
                          >
                            {item.completed ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : null}
                          </span>
                          <span>
                            <span className={cn("block text-sm font-medium", item.completed ? "text-muted-foreground line-through" : "text-foreground")}>
                              {item.label}
                            </span>
                            {item.note ? <span className="mt-1 block text-xs text-muted-foreground">{item.note}</span> : null}
                          </span>
                        </button>
                      ))}
                    </div>
                  </ReviewBlock>

                  <ReviewBlock title={c.insights}>
                    <BulletList items={selected.insights} empty={c.noRecords} />
                  </ReviewBlock>

                  <ReviewBlock title={c.risks}>
                    <BulletList items={selected.risks} empty={c.noRecords} tone="warning" />
                  </ReviewBlock>
                </div>

                <div className="space-y-4">
                  <ReviewBlock title={c.lessons}>
                    <BulletList items={selected.lessons} empty={c.notesPlaceholder} />
                  </ReviewBlock>
                  <ReviewBlock title={c.nextActions}>
                    <BulletList items={selected.nextActions} empty={c.notesPlaceholder} />
                  </ReviewBlock>

                  <div className="rounded-md border border-border bg-muted/20 p-3">
                    <Textarea
                      className="min-h-28"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder={c.notesPlaceholder}
                    />
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Button type="button" variant="secondary" onClick={() => addNote("lesson")} disabled={!note.trim()}>
                        {c.addLesson}
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => addNote("action")} disabled={!note.trim()}>
                        {c.addAction}
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => update({ id: selected.id, status: "skipped" })}
                      disabled={busy === `update:${selected.id}`}
                    >
                      <SkipForward className="me-2 size-4" aria-hidden="true" />
                      {c.skip}
                    </Button>
                    <Button type="button" variant="danger" onClick={() => remove(selected)} disabled={busy === `delete:${selected.id}`}>
                      <Trash2 className="me-2 size-4" aria-hidden="true" />
                      {c.delete}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState title={c.emptyTitle} description={c.generateHint} />
          )}
        </SectionPanel>
      </div>
    </div>
  );
}

function toChecklist(value: Review["checklist"] | undefined): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ChecklistItem => typeof item === "object" && item !== null && "key" in item && "label" in item);
}

function upsertReview(reviews: Review[], review: Review | null) {
  if (!review) return reviews;
  const exists = reviews.some((item) => item.id === review.id);
  if (exists) {
    return reviews.map((item) => (item.id === review.id ? review : item));
  }
  return [review, ...reviews];
}

function checklistProgress(items: ChecklistItem[]) {
  if (items.length === 0) return 0;
  return items.filter((item) => item.completed).length / items.length;
}

function numberMetric(metrics: Review["metrics"], key: string) {
  const value = metrics?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function dateRange(start: string, end: string, locale: Locale) {
  const formatter = new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { month: "short", day: "numeric" });
  return `${formatter.format(new Date(start))} - ${formatter.format(new Date(end))}`;
}

function StatusBadge({ status, labels }: { status: ReviewStatus; labels: Record<ReviewStatus, string> }) {
  const tone = status === "completed" ? "success" : status === "skipped" ? "warning" : "default";
  return <Badge tone={tone}>{labels[status]}</Badge>;
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
      <p className={cn("mt-1 text-sm font-semibold", toneClass)}>{value}</p>
    </div>
  );
}

function ReviewBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-muted/15 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function BulletList({ items, empty, tone = "default" }: { items: string[]; empty: string; tone?: "default" | "warning" }) {
  if (items.length === 0) {
    return <p className="text-sm leading-6 text-muted-foreground">{empty}</p>;
  }

  return (
    <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span className={cn("mt-2 size-1.5 shrink-0 rounded-full", tone === "warning" ? "bg-warning" : "bg-primary")} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
