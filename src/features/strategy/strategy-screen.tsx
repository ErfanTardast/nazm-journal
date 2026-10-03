"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AuthRequiredState, LoadingState } from "@/components/ui/state";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, isAuthError } from "@/lib/api/client";
import { apiErrorText } from "@/lib/api/error-text";
import { formatLimitNumber, limitNumber, limitSummaryLines, type LimitValue } from "@/features/trade-plans/limit-format";
import { PlaybookCoachingPanel } from "./playbook-coaching-panel";
import { t, type getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";
import { splitListInput } from "@/lib/text/split-list";
import { parseNumberInput } from "@/lib/validation/number-input";

type Messages = ReturnType<typeof getMessages>;
type Strategy = {
  id: string;
  name: string;
  description: string | null;
  allowedMarkets: string[];
  isActive: boolean;
  /** A row of the sample workspace. */
  isSample?: boolean;
  // Optional numeric limits a plan made from the strategy is compared with (decimals arrive as text, "0.5000").
  riskPerTradePct?: LimitValue;
  maxDailyLossPct?: LimitValue;
  maxOpenPositions?: LimitValue;
};

const MARKETS = ["crypto", "forex", "stocks"] as const;
const LIMIT_KEYS = ["riskPerTradePct", "maxDailyLossPct", "maxOpenPositions"] as const;
type LimitKey = (typeof LIMIT_KEYS)[number];
const MARKETS_HINT_ID = "strategy-markets-hint";
const MARKETS_ERROR_ID = "strategy-markets-error";
const ALERT_CLASS = "rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive";

const copy = {
  en: {
    description: "Document repeatable entry, exit, invalidation, risk, market, and session rules.",
    formTitle: "Create Strategy",
    name: "Name",
    descriptionLabel: "Description",
    entryRules: "Entry rules",
    exitRules: "Exit rules",
    invalidationRules: "Invalidation rules",
    riskRules: "Risk rules",
    markets: "Markets",
    marketsHint: "Choose every market this playbook is for.",
    marketsRequired: "Choose at least one market.",
    marketNames: { crypto: "Crypto", forex: "Forex", stocks: "Global Stocks" } as Record<string, string>,
    sessions: "Sessions",
    sessionsHint: "Separate sessions with commas.",
    checklist: "Pre-trade checklist",
    oneRulePerLine: "One rule per line",
    oneItemPerLine: "One item per line",
    create: "Create strategy",
    saving: "Saving...",
    saveFailed: "The strategy could not be saved.",
    loadFailed: "Strategies failed to load.",
    emptyTitle: "No strategies yet",
    emptyDescription: "A strategy keeps the entry, exit and invalidation rules you follow in one place. Create your first one with the form above.",
    columns: { name: "Name", markets: "Markets", limits: "Limits", status: "Status", plan: "Plan" },
    active: "Active",
    inactive: "Inactive",
    sample: "Sample",
    riskPerTradePct: "Risk per trade %",
    maxDailyLossPct: "Max daily loss %",
    maxOpenPositions: "Max open positions",
    limitHints: {
      riskPerTradePct: "Optional. A plan from this strategy that risks more than this percent of the account gets a warning before you save it. Empty: the limit in your settings applies.",
      maxDailyLossPct: "Optional. Each plan's risk % is compared with it, and a plan above it gets a warning before you save it. Empty: the limit in your settings applies.",
      maxOpenPositions: "Optional. Compared with how many of your plans are planned or active, counting the new one."
    },
    limitLabels: { riskPerTradePct: "Risk per trade", maxDailyLossPct: "Daily loss", maxOpenPositions: "Open positions" },
    noLimits: "No limits set",
    editLimits: "Edit limits",
    saveLimits: "Save limits",
    savingLimits: "Saving...",
    cancel: "Cancel",
    limitsSaveFailed: "The limits could not be saved.",
    planFromStrategy: "Plan from this strategy",
    placeholders: {
      name: "e.g. Range fade",
      description: "What is this playbook for?",
      entryRules: "e.g. Wait for the sweep\nConfirm with volume",
      exitRules: "e.g. Exit at the range midpoint\nExit on invalidation",
      invalidationRules: "e.g. Close outside the range",
      riskRules: "e.g. Stop for the day after two losses",
      sessions: "e.g. London, New York",
      checklist: "e.g. Waited for the sweep\nVolume confirmed",
      riskPerTradePct: "e.g. 0.5",
      maxDailyLossPct: "e.g. 2",
      maxOpenPositions: "e.g. 3"
    }
  },
  fa: {
    description: "قوانین تکرارشدنی ورود، خروج، ابطال، ریسک، بازار و سشن را مستند کنید.",
    formTitle: "ساخت استراتژی",
    name: "نام",
    descriptionLabel: "توضیح",
    entryRules: "قوانین ورود",
    exitRules: "قوانین خروج",
    invalidationRules: "قوانین ابطال",
    riskRules: "قوانین ریسک",
    markets: "بازارها",
    marketsHint: "بازارهایی را که این پلی‌بوک برای آن‌ها نوشته شده انتخاب کنید.",
    marketsRequired: "حداقل یک بازار را انتخاب کنید.",
    marketNames: { crypto: "کریپتو", forex: "فارکس", stocks: "سهام جهانی" } as Record<string, string>,
    sessions: "سشن‌ها",
    sessionsHint: "سشن‌ها را با ویرگول جدا کنید.",
    checklist: "چک‌لیست پیش از معامله",
    oneRulePerLine: "هر قانون در یک خط",
    oneItemPerLine: "هر مورد در یک خط",
    create: "ساخت استراتژی",
    saving: "در حال ذخیره...",
    saveFailed: "ذخیره استراتژی ممکن نشد.",
    loadFailed: "بارگذاری استراتژی‌ها ممکن نشد.",
    emptyTitle: "هنوز استراتژی‌ای نیست",
    emptyDescription: "استراتژی جایی است که قوانین ورود، خروج و ابطال را یک‌جا نگه می‌دارید. اولین استراتژی را با فرم بالا بسازید.",
    columns: { name: "نام", markets: "بازارها", limits: "سقف‌ها", status: "وضعیت", plan: "پلن" },
    active: "فعال",
    inactive: "غیرفعال",
    sample: "نمونه",
    riskPerTradePct: "درصد ریسک هر معامله",
    maxDailyLossPct: "حداکثر ضرر روزانه (درصد)",
    maxOpenPositions: "حداکثر پوزیشن‌های باز",
    limitHints: {
      riskPerTradePct: "اختیاری. اگر پلنی از این استراتژی بیش از این درصد از حساب را به ریسک بگذارد، پیش از ذخیره هشدار می‌گیرد. اگر خالی بماند، سقف تنظیمات شما اعمال می‌شود.",
      maxDailyLossPct: "اختیاری. درصد ریسک هر پلن با این سقف مقایسه می‌شود و پلن بالاتر از آن پیش از ذخیره هشدار می‌گیرد. اگر خالی بماند، سقف تنظیمات شما اعمال می‌شود.",
      maxOpenPositions: "اختیاری. با شمار پلن‌های برنامه‌ریزی‌شده یا فعال شما، به‌همراه پلن جدید، مقایسه می‌شود."
    },
    limitLabels: { riskPerTradePct: "ریسک هر معامله", maxDailyLossPct: "ضرر روزانه", maxOpenPositions: "پوزیشن باز" },
    noLimits: "سقفی تعیین نشده",
    editLimits: "ویرایش سقف‌ها",
    saveLimits: "ذخیره سقف‌ها",
    savingLimits: "در حال ذخیره...",
    cancel: "لغو",
    limitsSaveFailed: "ذخیره سقف‌ها ممکن نشد.",
    planFromStrategy: "ساخت پلن از این استراتژی",
    placeholders: {
      name: "مثلاً بازگشت به میانه محدوده",
      description: "این پلی‌بوک برای چه کاری است؟",
      entryRules: "مثلاً منتظر جمع‌آوری نقدینگی بمانید\nبا حجم تأیید کنید",
      exitRules: "مثلاً در میانه محدوده خارج شوید\nبا ابطال خارج شوید",
      invalidationRules: "مثلاً بسته شدن بیرون از محدوده",
      riskRules: "مثلاً بعد از دو ضرر، آن روز معامله نکنید",
      sessions: "مثلاً لندن، نیویورک",
      checklist: "مثلاً منتظر جمع‌آوری نقدینگی ماندم\nحجم تأیید شد",
      riskPerTradePct: "مثلاً 0.5",
      maxDailyLossPct: "مثلاً 2",
      maxOpenPositions: "مثلاً 3"
    }
  }
} as const;

/** One item per line, trimmed and without blanks (a textarea may hand back "\r\n"). */
function lines(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function StrategyScreen({ locale, messages }: { locale: Locale; messages: Messages }) {
  const c = copy[locale];
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  // The empty state is only true once a load has worked: not while loading, and not after a failed load.
  const [listState, setListState] = useState<"loading" | "loaded" | "failed">("loading");
  // The list could not be loaded: a banner at the top of the page.
  const [loadError, setLoadError] = useState<string | null>(null);
  // Problems with the form sit inside it, next to what the trader has to fix or press: the missing market under the
  // markets, a failed save just above the Create button.
  const [marketsError, setMarketsError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  // The strategy whose limits are being edited in its row (one at a time), and how that save is going.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [limitsBusy, setLimitsBusy] = useState(false);
  const [limitsError, setLimitsError] = useState<string | null>(null);
  const fieldLabels: Record<string, string> = {
    name: c.name,
    description: c.descriptionLabel,
    entryRules: c.entryRules,
    exitRules: c.exitRules,
    invalidationRules: c.invalidationRules,
    riskRules: c.riskRules,
    allowedMarkets: c.markets,
    allowedSessions: c.sessions,
    checklist: c.checklist,
    riskPerTradePct: c.riskPerTradePct,
    maxDailyLossPct: c.maxDailyLossPct,
    maxOpenPositions: c.maxOpenPositions
  };

  async function load() {
    try {
      const data = await apiFetch<{ strategies: Strategy[] }>("/api/strategies");
      setStrategies(data.strategies);
      setListState("loaded");
      setLoadError(null);
    } catch (err) {
      if (isAuthError(err)) setAuthRequired(true);
      else {
        setListState((state) => (state === "loaded" ? state : "failed"));
        setLoadError(apiErrorText(err, locale, c.loadFailed));
      }
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // React clears event.currentTarget once the handler returns its promise, so take the form before awaiting.
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const allowedMarkets = form.getAll("allowedMarkets").map(String);
    if (allowedMarkets.length === 0) {
      setMarketsError(c.marketsRequired);
      setSaveError(null);
      // The message is under the markets: take the trader there, onto the first choice.
      formEl.querySelector<HTMLInputElement>('input[name="allowedMarkets"]')?.focus();
      return;
    }
    // Only what the trader typed goes to the server; the optional lists are left out when blank (the server stores []).
    const description = String(form.get("description") ?? "").trim();
    const riskRules = lines(form.get("riskRules"));
    const allowedSessions = splitListInput(form.get("allowedSessions"));
    const checklist = lines(form.get("checklist"));
    // The limits are optional: only the ones that were typed go along, exactly as typed (the server reads Persian digits).
    const limits: Partial<Record<LimitKey, string>> = {};
    for (const key of LIMIT_KEYS) {
      const typed = String(form.get(key) ?? "").trim();
      if (typed) limits[key] = typed;
    }
    setSubmitting(true);
    setMarketsError(null);
    setSaveError(null);
    try {
      await apiFetch("/api/strategies", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          ...(description ? { description } : {}),
          entryRules: lines(form.get("entryRules")),
          exitRules: lines(form.get("exitRules")),
          invalidationRules: lines(form.get("invalidationRules")),
          ...(riskRules.length ? { riskRules } : {}),
          allowedMarkets,
          ...(allowedSessions.length ? { allowedSessions } : {}),
          ...(checklist.length ? { checklist } : {}),
          ...limits
        })
      });
      formEl.reset();
      await load();
    } catch (err) {
      if (isAuthError(err)) setAuthRequired(true);
      else setSaveError(apiErrorText(err, locale, c.saveFailed, fieldLabels));
    } finally {
      setSubmitting(false);
    }
  }

  function openLimitsEditor(id: string) {
    setLimitsError(null);
    setEditingId(id);
  }

  /** Saves the limits of one strategy: only the fields that changed are sent, and a field that was emptied is sent as null. */
  async function saveLimits(row: Strategy, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (limitsBusy) return;
    const form = new FormData(event.currentTarget);
    const changes: Partial<Record<LimitKey, string | null>> = {};
    for (const key of LIMIT_KEYS) {
      const typed = String(form.get(key) ?? "").trim();
      const current = limitNumber(row[key]);
      if (!typed) {
        if (current !== null) changes[key] = null;
      } else if (current === null || parseNumberInput(typed) !== current) {
        changes[key] = typed;
      }
    }
    if (Object.keys(changes).length === 0) {
      setEditingId(null);
      return;
    }
    setLimitsBusy(true);
    setLimitsError(null);
    try {
      await apiFetch("/api/strategies", { method: "PATCH", body: JSON.stringify({ id: row.id, ...changes }) });
      setEditingId(null);
      await load();
    } catch (err) {
      if (isAuthError(err)) setAuthRequired(true);
      else setLimitsError(apiErrorText(err, locale, c.limitsSaveFailed, fieldLabels));
    } finally {
      setLimitsBusy(false);
    }
  }

  /** A saved limit as the trader would type it, in the digits of the page language ("" when it is not set). */
  function formatEditable(value: LimitValue) {
    const number = limitNumber(value);
    return number === null ? "" : formatLimitNumber(number, locale);
  }


  if (authRequired) return <AuthRequiredState locale={locale} />;

  return (
    <div className="space-y-6">
      <PageHeader title={t(messages, "pages.strategies")} description={c.description} />
      {loadError ? <p role="alert" className={ALERT_CLASS}>{loadError}</p> : null}
      <Card>
        <CardHeader><CardTitle>{c.formTitle}</CardTitle></CardHeader>
        <CardContent>
          <form className="grid gap-3" onSubmit={submit}>
            <Field label={`${c.name} *`}>
              <Input name="name" placeholder={c.placeholders.name} required minLength={2} />
            </Field>
            <Field label={c.descriptionLabel}>
              <Textarea name="description" placeholder={c.placeholders.description} />
            </Field>
            <Field label={`${c.entryRules} *`} hint={c.oneRulePerLine}>
              <Textarea name="entryRules" placeholder={c.placeholders.entryRules} required />
            </Field>
            <Field label={`${c.exitRules} *`} hint={c.oneRulePerLine}>
              <Textarea name="exitRules" placeholder={c.placeholders.exitRules} required />
            </Field>
            <Field label={c.invalidationRules} hint={c.oneRulePerLine}>
              <Textarea name="invalidationRules" placeholder={c.placeholders.invalidationRules} />
            </Field>
            <Field label={c.riskRules} hint={c.oneRulePerLine}>
              <Textarea name="riskRules" placeholder={c.placeholders.riskRules} />
            </Field>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label={c.riskPerTradePct} hint={c.limitHints.riskPerTradePct}>
                <Input name="riskPerTradePct" inputMode="decimal" placeholder={c.placeholders.riskPerTradePct} />
              </Field>
              <Field label={c.maxDailyLossPct} hint={c.limitHints.maxDailyLossPct}>
                <Input name="maxDailyLossPct" inputMode="decimal" placeholder={c.placeholders.maxDailyLossPct} />
              </Field>
              <Field label={c.maxOpenPositions} hint={c.limitHints.maxOpenPositions}>
                <Input name="maxOpenPositions" inputMode="numeric" placeholder={c.placeholders.maxOpenPositions} />
              </Field>
            </div>
            <fieldset
              className="space-y-2 text-sm"
              aria-invalid={marketsError ? true : undefined}
              aria-describedby={marketsError ? `${MARKETS_HINT_ID} ${MARKETS_ERROR_ID}` : MARKETS_HINT_ID}
            >
              <legend className="font-medium text-foreground">{`${c.markets} *`}</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-muted-foreground">
                {MARKETS.map((market) => (
                  <label key={market} className="flex cursor-pointer items-center gap-2">
                    <input
                      name="allowedMarkets"
                      type="checkbox"
                      value={market}
                      className="size-4 rounded"
                      onChange={() => setMarketsError(null)}
                    />
                    {c.marketNames[market]}
                  </label>
                ))}
              </div>
              <span id={MARKETS_HINT_ID} className="block text-xs leading-5 text-muted-foreground">{c.marketsHint}</span>
            </fieldset>
            {marketsError ? <p id={MARKETS_ERROR_ID} role="alert" className={ALERT_CLASS}>{marketsError}</p> : null}
            <Field label={c.sessions} hint={c.sessionsHint}>
              <Input name="allowedSessions" placeholder={c.placeholders.sessions} />
            </Field>
            <Field label={c.checklist} hint={c.oneItemPerLine}>
              <Textarea name="checklist" placeholder={c.placeholders.checklist} />
            </Field>
            {saveError ? <p role="alert" className={ALERT_CLASS}>{saveError}</p> : null}
            <Button disabled={submitting}>{submitting ? c.saving : c.create}</Button>
          </form>
        </CardContent>
      </Card>
      {listState === "loading" ? <LoadingState locale={locale} /> : null}
      {listState === "loaded" ? (
        <DataTable
          rows={strategies}
          emptyTitle={c.emptyTitle}
          emptyDescription={c.emptyDescription}
          columns={[
            {
              key: "name",
              header: c.columns.name,
              cell: (row) => (
                <span className="inline-flex items-center gap-2">
                  <span className="font-medium text-foreground">{row.name}</span>
                  {row.isSample ? <Badge>{c.sample}</Badge> : null}
                </span>
              )
            },
            { key: "markets", header: c.columns.markets, cell: (row) => row.allowedMarkets.map((market) => c.marketNames[market] ?? market).join(locale === "fa" ? "، " : ", ") },
            {
              key: "limits",
              header: c.columns.limits,
              cell: (row) => {
                const lines = limitSummaryLines(row, c.limitLabels, locale);
                return editingId === row.id ? (
                  <form className="min-w-72 space-y-3 whitespace-normal py-1" onSubmit={(event) => saveLimits(row, event)}>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label={c.riskPerTradePct}>
                        <Input name="riskPerTradePct" inputMode="decimal" defaultValue={formatEditable(row.riskPerTradePct)} placeholder={c.placeholders.riskPerTradePct} />
                      </Field>
                      <Field label={c.maxDailyLossPct}>
                        <Input name="maxDailyLossPct" inputMode="decimal" defaultValue={formatEditable(row.maxDailyLossPct)} placeholder={c.placeholders.maxDailyLossPct} />
                      </Field>
                      <Field label={c.maxOpenPositions}>
                        <Input name="maxOpenPositions" inputMode="numeric" defaultValue={formatEditable(row.maxOpenPositions)} placeholder={c.placeholders.maxOpenPositions} />
                      </Field>
                    </div>
                    {limitsError ? <p role="alert" className={ALERT_CLASS}>{limitsError}</p> : null}
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={limitsBusy}>{limitsBusy ? c.savingLimits : c.saveLimits}</Button>
                      <Button type="button" variant="secondary" disabled={limitsBusy} onClick={() => setEditingId(null)}>{c.cancel}</Button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-1.5 whitespace-normal">
                    {lines.length > 0 ? (
                      <ul className="space-y-0.5 text-xs leading-5 text-foreground">
                        {lines.map((line) => <li key={line}>{line}</li>)}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">{c.noLimits}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => openLimitsEditor(row.id)}
                      className="text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {c.editLimits}
                    </button>
                  </div>
                );
              }
            },
            { key: "status", header: c.columns.status, cell: (row) => <Badge tone={row.isActive ? "success" : "default"}>{row.isActive ? c.active : c.inactive}</Badge> },
            {
              key: "plan",
              header: c.columns.plan,
              cell: (row) => (
                <Link
                  href={`/${locale}/plans?strategy=${encodeURIComponent(row.id)}`}
                  className="text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {c.planFromStrategy}
                </Link>
              )
            }
          ]}
        />
      ) : null}
      <PlaybookCoachingPanel messages={messages} locale={locale} />
    </div>
  );
}
