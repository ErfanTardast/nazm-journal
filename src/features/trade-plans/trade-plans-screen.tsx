"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRightLeft, CheckCircle2, Clock, Gauge, XCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SectionPanel } from "@/components/ui/section-panel";
import { Select } from "@/components/ui/select";
import { AuthRequiredState, EmptyState, LoadingState } from "@/components/ui/state";
import { Textarea } from "@/components/ui/textarea";
import { askSampleRecheck } from "@/features/sample/sample-workspace-client";
import { apiFetch, isAuthError } from "@/lib/api/client";
import { checkPlanRisk, resolveRiskLimits } from "@/lib/calculations/plan-risk-check";
import { explicitPlanSide, tradePlanSide } from "@/lib/calculations/trade-plan-side";
import { t, type getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";
import type { PlanSizing } from "@/lib/validation/trading";
import { parseNumberInput } from "@/lib/validation/number-input";
import { formatLimitNumber, limitNumber } from "./limit-format";
import { describeViolation } from "./limit-warnings";
import { StrategyRulesPanel } from "./strategy-rules-panel";
import { onlyMarket, strategyChecklistItems, type PlanStrategy } from "./strategy-link";

type Messages = ReturnType<typeof getMessages>;
type TradePlan = {
  id: string;
  strategyId: string | null;
  market: string;
  symbol: string;
  bias: string;
  entryZone: string;
  stopLoss: number | null;
  takeProfit: number | null;
  riskAmount: number | null;
  riskPercent: number | null;
  checklist: Record<string, unknown>;
  invalidationRule: string | null;
  notes: string | null;
  status: string;
  strategy: { id: string; name: string } | null;
  /** A row of the sample workspace. */
  isSample?: boolean;
  /** What the risk desk worked out for this plan, when it was sized there. */
  sizing?: PlanSizing | null;
};
/** The account-wide limits from the settings: the ones a strategy does not set. */
type AccountLimits = { riskPerTradePct: number; maxDailyLossPct: number };

type PlanGap = "invalidation" | "risk" | "checklist";

/** What a plan still lacks to count as complete (the same three conditions the dashboard readiness uses). */
function planGaps(plan: TradePlan): PlanGap[] {
  const checks = Object.values(plan.checklist ?? {});
  const gaps: PlanGap[] = [];
  if (!plan.invalidationRule?.trim()) gaps.push("invalidation");
  if (!(Number(plan.riskAmount ?? 0) > 0 || Number(plan.riskPercent ?? 0) > 0)) gaps.push("risk");
  if (!(checks.length > 0 && checks.every(Boolean))) gaps.push("checklist");
  return gaps;
}

/** Lots with up to three decimals and no trailing zeros ("0.48"). */
function formatLots(value: number) {
  return String(Number(value.toFixed(3)));
}

const copy = {
  en: {
    description: "Build reviewable scenarios with risk, checklist, and invalidation before placing a trade.",
    form: "New plan",
    formDesc: "A written plan should define invalidation, risk, and checklist readiness before the trade.",
    coreSection: "Core",
    riskSection: "Risk, invalidation & checklist",
    contextSection: "Context & notes",
    invalidation: "Invalidation rule",
    news: "Related context",
    notes: "Planning notes",
    save: "Save plan",
    saving: "Saving...",
    emptyTitle: "No plans yet",
    emptyDescription: "Write down your setup, what would cancel it and how much you risk before you trade: use the New plan form to create your first plan.",
    table: "Planning board",
    tableDesc: "Plans are reviewed records. Convert a plan into a journal entry when the trade executes.",
    convert: "Convert to trade",
    converting: "Converting...",
    convertDesc: "Record the actual execution against this plan.",
    convertEntryPrice: "Entry price",
    convertQuantity: "Quantity",
    convertExitPrice: "Exit price",
    convertFees: "Fees",
    convertSubmit: "Record trade",
    convertCancel: "Cancel",
    complete: "Complete",
    incomplete: "Incomplete",
    missing: "Missing:",
    gaps: { invalidation: "invalidation rule", risk: "risk amount or risk %", checklist: "all checklist items ticked" },
    listSeparator: ", ",
    unplanned: "No playbook",
    newsChecked: "News context checked",
    riskCalculated: "Risk amount calculated",
    strategyMatched: "Strategy / playbook matched",
    market: "Market",
    markets: { crypto: "Crypto", forex: "Forex", stocks: "Global Stocks" },
    symbol: "Symbol",
    direction: "Direction",
    directionChoose: "Choose long or short",
    sides: { long: "Long", short: "Short" },
    bias: "Bias",
    entryZone: "Entry zone",
    stopLoss: "Stop loss",
    takeProfit: "Take profit",
    riskAmount: "Risk amount",
    riskPercent: "Risk %",
    statuses: { planned: "Planned", active: "Active", closed: "Closed", canceled: "Canceled" },
    invalidationLabel: "Invalidation:",
    tradeSide: "Trade side",
    tradeSideOlderPlan: "This plan was saved before directions existed. Check it: your choice is saved to the plan and sets the trade's side.",
    validationFailed: "Please check these fields:",
    strategy: "Strategy",
    strategyHint: "Optional. Its rules show next to the form, its limits are checked as you type, and its checklist joins this plan's.",
    noStrategy: "No strategy",
    sample: "Sample",
    inactive: "Inactive",
    fromStrategy: "From the strategy:",
    strategyChecklist: (name: string) => `Checklist of "${name}"`,
    limitWarningTitle: "Over a limit",
    warningOnly: "This is only a warning. You can still save the plan.",
    strategyLine: "Strategy:",
    sizeIt: "Size it in the risk desk",
    sizingTitle: "Sized in the risk desk",
    sizingLots: "Total lots",
    sizingLegs: "Legs",
    sizingLoss: "Loss at the stop",
    attachStrategy: "Attach a strategy",
    attachChoose: "Choose a strategy",
    attach: "Attach",
    attaching: "Attaching...",
    attachCancel: "Cancel",
    attachLabel: (symbol: string) => `Strategy for ${symbol}`,
    createStrategy: "Create a strategy",
    errors: {
      CONFLICT: "This plan was already converted to a trade.",
      RATE_LIMITED: "Too many attempts. Wait a minute and try again.",
      VALIDATION_ERROR: "Some fields are not valid. Check them and try again.",
      NOT_FOUND: "This plan no longer exists. Reload the page.",
      NETWORK: "Could not reach the server. Check your connection and try again.",
      GENERIC: "Something went wrong. Please try again in a moment."
    },
    placeholders: {
      symbol: "BTCUSDT",
      bias: "e.g. Constructive above the 65k support",
      entryZone: "64600-65100",
      stopLoss: "63750",
      takeProfit: "67000",
      riskAmount: "125",
      riskPercent: "0.5",
      invalidation: "e.g. A close below the session midpoint invalidates the plan.",
      news: "Relevant macro or news context.",
      notes: "Planning notes or reminders."
    }
  },
  fa: {
    description: "سناریوهای قابل مرور را با ریسک، چک‌لیست و قانون ابطال پیش از ورود آماده کنید.",
    form: "پلن جدید",
    formDesc: "پلن مکتوب باید ابطال، ریسک و آمادگی چک‌لیست را پیش از معامله مشخص کند.",
    coreSection: "اصول",
    riskSection: "ریسک، ابطال و چک‌لیست",
    contextSection: "زمینه و یادداشت",
    invalidation: "قانون ابطال",
    news: "زمینه مرتبط",
    notes: "یادداشت پلن",
    save: "ذخیره پلن",
    saving: "در حال ذخیره...",
    emptyTitle: "هنوز پلنی ثبت نشده است",
    emptyDescription: "پیش از هر معامله، سناریو، شرط ابطال و میزان ریسک را بنویسید؛ اولین پلن را با فرم «پلن جدید» بسازید.",
    table: "برد برنامه‌ریزی",
    tableDesc: "پلن‌ها رکوردهای قابل مرور هستند. بعد از اجرای معامله، پلن را به ورودی ژورنال تبدیل کنید.",
    convert: "تبدیل به معامله",
    converting: "در حال تبدیل...",
    convertDesc: "اجرای واقعی را بر پایه این پلن ثبت کنید.",
    convertEntryPrice: "قیمت ورود",
    convertQuantity: "حجم",
    convertExitPrice: "قیمت خروج",
    convertFees: "کارمزد",
    convertSubmit: "ثبت معامله",
    convertCancel: "لغو",
    complete: "کامل",
    incomplete: "ناقص",
    missing: "کم دارد:",
    gaps: { invalidation: "قانون ابطال", risk: "مبلغ یا درصد ریسک", checklist: "تیک همه موارد چک‌لیست" },
    listSeparator: "، ",
    unplanned: "بدون پلی‌بوک",
    newsChecked: "زمینه خبری بررسی شد",
    riskCalculated: "مبلغ ریسک محاسبه شد",
    strategyMatched: "استراتژی / پلی‌بوک تطبیق داده شد",
    market: "بازار",
    markets: { crypto: "کریپتو", forex: "فارکس", stocks: "سهام جهانی" },
    symbol: "نماد",
    direction: "جهت",
    directionChoose: "لانگ یا شورت را انتخاب کنید",
    sides: { long: "لانگ", short: "شورت" },
    bias: "دیدگاه",
    entryZone: "ناحیه ورود",
    stopLoss: "حد ضرر",
    takeProfit: "حد سود",
    riskAmount: "مبلغ ریسک",
    riskPercent: "درصد ریسک",
    statuses: { planned: "برنامه‌ریزی‌شده", active: "فعال", closed: "بسته", canceled: "لغو‌شده" },
    invalidationLabel: "ابطال:",
    tradeSide: "سمت معامله",
    tradeSideOlderPlan: "برای این پلن قدیمی جهتی ثبت نشده است. لانگ یا شورت را خودتان انتخاب کنید؛ همین انتخاب در پلن ذخیره می‌شود و معامله با آن ثبت می‌شود.",
    validationFailed: "این فیلدها را بررسی کنید:",
    strategy: "استراتژی",
    strategyHint: "اختیاری. قوانین آن کنار فرم نشان داده می‌شود، سقف‌هایش هنگام نوشتن بررسی می‌شود و چک‌لیستش به چک‌لیست این پلن اضافه می‌شود.",
    noStrategy: "بدون استراتژی",
    sample: "نمونه",
    inactive: "غیرفعال",
    fromStrategy: "از استراتژی:",
    strategyChecklist: (name: string) => `چک‌لیست «${name}»`,
    limitWarningTitle: "بیش از سقف",
    warningOnly: "این فقط یک هشدار است؛ همچنان می‌توانید پلن را ذخیره کنید.",
    strategyLine: "استراتژی:",
    sizeIt: "محاسبه اندازه پوزیشن در ماشین‌حساب ریسک",
    sizingTitle: "محاسبه‌شده در ماشین‌حساب ریسک",
    sizingLots: "حجم کل (لات)",
    sizingLegs: "تعداد بخش‌ها",
    sizingLoss: "زیان در حد ضرر",
    attachStrategy: "افزودن استراتژی",
    attachChoose: "یک استراتژی انتخاب کنید",
    attach: "افزودن",
    attaching: "در حال افزودن...",
    attachCancel: "لغو",
    attachLabel: (symbol: string) => `استراتژی برای ${symbol}`,
    createStrategy: "ساخت استراتژی",
    errors: {
      CONFLICT: "این پلن قبلاً به معامله تبدیل شده است.",
      RATE_LIMITED: "تعداد تلاش‌ها بیش از حد مجاز است. یک دقیقه صبر کنید و دوباره امتحان کنید.",
      VALIDATION_ERROR: "برخی فیلدها معتبر نیستند. آن‌ها را بررسی کنید و دوباره تلاش کنید.",
      NOT_FOUND: "این پلن دیگر وجود ندارد. صفحه را دوباره بارگذاری کنید.",
      NETWORK: "اتصال به سرور برقرار نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.",
      GENERIC: "مشکلی پیش آمد. کمی بعد دوباره تلاش کنید."
    },
    placeholders: {
      symbol: "BTCUSDT",
      bias: "مثلاً مثبت بالای حمایت ۶۵ هزار",
      entryZone: "64600-65100",
      stopLoss: "63750",
      takeProfit: "67000",
      riskAmount: "125",
      riskPercent: "0.5",
      invalidation: "مثلاً بسته شدن زیر میانه جلسه این پلن را باطل می‌کند.",
      news: "زمینه کلان یا خبری مرتبط.",
      notes: "یادداشت یا یادآوری پلن."
    }
  }
} as const;

function label(map: Record<string, string>, key: string) {
  return map[key] ?? key;
}

export function TradePlansScreen({ locale, messages, initialStrategyId }: { locale: Locale; messages: Messages; initialStrategyId?: string }) {
  const c = copy[locale];
  const [plans, setPlans] = useState<TradePlan[]>([]);
  // Until the first answer arrives an empty list means nothing yet, so the empty state waits for it.
  const [loaded, setLoaded] = useState(false);
  // The last load failed: the alert above says why, so the board must not keep looking as if it is still loading.
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  // The plan whose conversion request is in flight, so Record trade cannot be pressed twice.
  const [convertBusyId, setConvertBusyId] = useState<string | null>(null);
  // The strategies the plan can be linked to and the account-wide limits. Both are extras: when either cannot be read
  // the form works without it and says nothing.
  const [strategies, setStrategies] = useState<PlanStrategy[]>([]);
  const [account, setAccount] = useState<AccountLimits | null>(null);
  // The form fields the strategy reaches into are controlled; the others are read from the form when it is sent.
  const [strategyId, setStrategyId] = useState("");
  const [market, setMarket] = useState("crypto");
  const [riskPercent, setRiskPercent] = useState("");
  const [invalidation, setInvalidation] = useState("");
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  // The risk % that was filled in from a strategy's limit (not typed): another strategy may replace it, typing ends that.
  const filledRisk = useRef<string | null>(null);
  const preselected = useRef(false);
  // A plan card whose "attach a strategy" picker is open, the choice in it, and the plan being attached to.
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const [attachChoice, setAttachChoice] = useState("");
  const [attachBusyId, setAttachBusyId] = useState<string | null>(null);
  const fieldLabels: Record<string, string> = {
    strategyId: c.strategy,
    market: c.market,
    symbol: c.symbol,
    bias: c.bias,
    entryZone: c.entryZone,
    stopLoss: c.stopLoss,
    takeProfit: c.takeProfit,
    riskAmount: c.riskAmount,
    riskPercent: c.riskPercent,
    invalidationRule: c.invalidation,
    relevantNews: c.news,
    notes: c.notes,
    entryPrice: c.convertEntryPrice,
    exitPrice: c.convertExitPrice,
    quantity: c.convertQuantity,
    fees: c.convertFees
  };

  /**
   * Any non-sign-in failure is shown in the page language: the rejected fields when the server names them, otherwise
   * a message chosen by the error code (the server's own text is English whatever the page language is).
   */
  function describeError(err: unknown) {
    const { code, status, details } = (err ?? {}) as { code?: unknown; status?: unknown; details?: { fieldErrors?: Record<string, unknown> } | null };
    const names = details?.fieldErrors && typeof details.fieldErrors === "object" ? Object.keys(details.fieldErrors) : [];
    if (names.length > 0) return `${c.validationFailed} ${names.map((name) => fieldLabels[name] ?? name).join(c.listSeparator)}`;
    if (err instanceof TypeError) return c.errors.NETWORK;
    if (code === "RATE_LIMITED" || status === 429) return c.errors.RATE_LIMITED;
    if (code === "VALIDATION_ERROR" || status === 422) return c.errors.VALIDATION_ERROR;
    if (code === "CONFLICT" || status === 409) return c.errors.CONFLICT;
    if (code === "NOT_FOUND" || status === 404) return c.errors.NOT_FOUND;
    return c.errors.GENERIC;
  }

  async function load() {
    try {
      const data = await apiFetch<{ tradePlans: TradePlan[] }>("/api/trade-plans");
      setPlans(data.tradePlans);
      setLoaded(true);
      setLoadFailed(false);
      setError(null);
    } catch (err) {
      setLoadFailed(true);
      setError(err);
    }
  }

  async function loadStrategies() {
    try {
      const data = await apiFetch<{ strategies: PlanStrategy[] }>("/api/strategies");
      if (Array.isArray(data.strategies)) setStrategies(data.strategies);
    } catch {
      // The picker then offers only "no strategy": a plan can be written without one, so nothing is shown.
    }
  }

  async function loadAccountLimits() {
    try {
      const data = await apiFetch<{ settings: { riskPerTradePct?: unknown; maxDailyLossPct?: unknown } }>("/api/users/me/settings");
      setAccount({ riskPerTradePct: Number(data.settings.riskPerTradePct), maxDailyLossPct: Number(data.settings.maxDailyLossPct) });
    } catch {
      // Without the account limits only a strategy's own limits are checked: no warning, no error.
    }
  }

  useEffect(() => {
    void load();
    void loadStrategies();
    void loadAccountLimits();
  }, []);

  /** Chooses a strategy (or none) and lets it reach into the form: the market, the risk %, the checklist. */
  function chooseStrategy(next: PlanStrategy | null) {
    setStrategyId(next ? next.id : "");
    const only = onlyMarket(next);
    if (only) setMarket(only);
    // The risk % follows the strategy's limit while the trader has not typed one of their own.
    const limit = limitNumber(next?.riskPerTradePct);
    const fill = limit !== null ? formatLimitNumber(limit, locale) : null;
    if (riskPercent.trim() === "" || riskPercent === filledRisk.current) {
      filledRisk.current = fill;
      setRiskPercent(fill ?? "");
    }
  }

  // A link from a strategy row names the strategy to start from; it counts only when it is one of the user's.
  useEffect(() => {
    if (preselected.current || !initialStrategyId || strategies.length === 0) return;
    preselected.current = true;
    const own = strategies.find((strategy) => strategy.id === initialStrategyId);
    // Applied once, when the strategies first arrive; an id that is not the user's is ignored without a word.
    if (own) chooseStrategy(own);
  }, [strategies, initialStrategyId]);

  const chosen = strategies.find((strategy) => strategy.id === strategyId) ?? null;
  const strategyItems = strategyChecklistItems(chosen, [c.newsChecked, c.riskCalculated, c.strategyMatched]);
  // Active strategies, plus the one that is chosen or named in the link (an inactive one still starts a plan from its row).
  const pickable = strategies.filter((strategy) => strategy.isActive !== false || strategy.id === strategyId || strategy.id === initialStrategyId);
  const optionText = (strategy: PlanStrategy) =>
    `${strategy.name}${strategy.isSample ? ` (${c.sample})` : ""}${strategy.isActive === false ? ` (${c.inactive})` : ""}`;

  // The limits that apply to this plan, and where it steps over them: shown before saving, never blocking the save.
  const typedRisk = riskPercent.trim() === "" ? null : parseNumberInput(riskPercent);
  // The plans that are planned or active count as open positions; sample plans are not the trader's own.
  const openPositions = loaded ? plans.filter((plan) => (plan.status === "planned" || plan.status === "active") && !plan.isSample).length : undefined;
  const violations = checkPlanRisk({ riskPercent: typedRisk, openPositions }, resolveRiskLimits(chosen, account));

  function addInvalidationRule(rule: string) {
    setInvalidation((current) => {
      if (current.split(/\r?\n/).some((line) => line.trim() === rule)) return current;
      return current.trim() ? `${current.replace(/\s+$/, "")}\n${rule}` : rule;
    });
  }

  function resetFormState() {
    filledRisk.current = null;
    setStrategyId("");
    setMarket("crypto");
    setRiskPercent("");
    setInvalidation("");
    setTicked({});
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // React clears event.currentTarget once the handler returns its promise, so take the form before awaiting.
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/trade-plans", {
        method: "POST",
        body: JSON.stringify({
          ...(chosen ? { strategyId: chosen.id } : {}),
          market: form.get("market"),
          symbol: form.get("symbol"),
          bias: form.get("bias"),
          entryZone: form.get("entryZone"),
          stopLoss: form.get("stopLoss") || null,
          takeProfit: form.get("takeProfit") || null,
          riskAmount: form.get("riskAmount") || null,
          riskPercent: form.get("riskPercent") || null,
          invalidationRule: form.get("invalidationRule") || null,
          relevantNews: form.get("relevantNews") || null,
          notes: form.get("notes") || null,
          checklist: {
            newsChecked: form.get("newsChecked") === "on",
            riskCalculated: form.get("riskCalculated") === "on",
            strategyMatched: form.get("strategyMatched") === "on",
            // The strategy's own items are booleans too: an unticked one keeps the plan incomplete, like the three above.
            ...Object.fromEntries(strategyItems.map((item) => [item.key, Boolean(ticked[item.key])])),
            // The plan has no column for it, so the chosen direction rides along in the checklist JSON.
            direction: form.get("direction")
          }
        })
      });
      formEl.reset();
      resetFormState();
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  async function attachStrategy(plan: TradePlan) {
    if (attachBusyId || !attachChoice) return;
    setAttachBusyId(plan.id);
    setError(null);
    try {
      // The plan's own status goes along, so this edit can never be read as a change of status.
      await apiFetch("/api/trade-plans", { method: "PATCH", body: JSON.stringify({ id: plan.id, status: plan.status, strategyId: attachChoice }) });
      setAttachingId(null);
      setAttachChoice("");
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setAttachBusyId(null);
    }
  }

  async function convertPlan(plan: TradePlan, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (convertBusyId) return;
    const planId = plan.id;
    const form = new FormData(event.currentTarget);
    setConvertBusyId(planId);
    setError(null);
    try {
      // An older plan has no direction of its own: save the one the trader confirmed first, so the trade gets that side.
      const direction = form.get("direction");
      if (!explicitPlanSide(plan.checklist) && (direction === "long" || direction === "short")) {
        // The plan's own status goes along, so this edit can never be read as a change of status.
        await apiFetch("/api/trade-plans", {
          method: "PATCH",
          body: JSON.stringify({ id: planId, status: plan.status, checklist: { ...plan.checklist, direction } })
        });
      }
      await apiFetch(`/api/trade-plans/${planId}/convert`, {
        method: "POST",
        body: JSON.stringify({
          entryPrice: form.get("entryPrice"),
          exitPrice: form.get("exitPrice") || null,
          quantity: form.get("quantity"),
          fees: form.get("fees") || 0
        })
      });
      // The first trade of the person's own removes the sample data; the label in the shell checks again now.
      askSampleRecheck();
      setConvertingId(null);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setConvertBusyId(null);
    }
  }

  if (isAuthError(error)) return <AuthRequiredState locale={locale} />;

  return (
    <div className="space-y-6">
      <PageHeader title={t(messages, "pages.plans")} description={c.description} />
      {error && !isAuthError(error) ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {describeError(error)}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionPanel title={c.form} description={c.formDesc}>
          <form className="space-y-5" onSubmit={submit}>
            {/* The strategy comes first: its rules, limits and checklist shape the fields below. */}
            <div className="space-y-3">
              <Field label={c.strategy} hint={c.strategyHint}>
                <Select
                  name="strategyId"
                  value={strategyId}
                  onChange={(event) => chooseStrategy(strategies.find((strategy) => strategy.id === event.target.value) ?? null)}
                >
                  <option value="">{c.noStrategy}</option>
                  {pickable.map((strategy) => (
                    <option key={strategy.id} value={strategy.id}>{optionText(strategy)}</option>
                  ))}
                </Select>
              </Field>
              {chosen ? <StrategyRulesPanel strategy={chosen} locale={locale} /> : null}
            </div>

            {/* Core fields */}
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.coreSection}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={c.market}>
                  <Select name="market" value={market} onChange={(event) => setMarket(event.target.value)}>
                    <option value="crypto">{c.markets.crypto}</option>
                    <option value="forex">{c.markets.forex}</option>
                    <option value="stocks">{c.markets.stocks}</option>
                  </Select>
                </Field>
                <Field label={`${c.symbol} *`}>
                  <Input name="symbol" placeholder={c.placeholders.symbol} required />
                </Field>
                <Field label={`${c.direction} *`}>
                  <Select name="direction" defaultValue="" required>
                    <option value="">{c.directionChoose}</option>
                    <option value="long">{c.sides.long}</option>
                    <option value="short">{c.sides.short}</option>
                  </Select>
                </Field>
                <Field label={`${c.bias} *`}>
                  <Input name="bias" placeholder={c.placeholders.bias} required minLength={2} />
                </Field>
                <Field label={`${c.entryZone} *`}>
                  <Input name="entryZone" placeholder={c.placeholders.entryZone} required />
                </Field>
              </div>
            </div>

            {/* Risk & checklist */}
            <details open className="group">
              <summary className="mb-3 flex cursor-pointer list-none items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
                <span>{c.riskSection}</span>
                <span className="ms-auto text-[10px] text-muted-foreground group-open:hidden">▼</span>
                <span className="ms-auto text-[10px] text-muted-foreground [display:none] group-open:inline">▲</span>
              </summary>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={c.stopLoss}><Input name="stopLoss" placeholder={c.placeholders.stopLoss} inputMode="decimal" /></Field>
                <Field label={c.takeProfit}><Input name="takeProfit" placeholder={c.placeholders.takeProfit} inputMode="decimal" /></Field>
                <Field label={c.riskAmount}><Input name="riskAmount" placeholder={c.placeholders.riskAmount} inputMode="decimal" /></Field>
                <Field label={c.riskPercent}>
                  <Input
                    name="riskPercent"
                    placeholder={c.placeholders.riskPercent}
                    inputMode="decimal"
                    value={riskPercent}
                    onChange={(event) => {
                      // Typing makes the value the trader's own: a strategy chosen later no longer replaces it.
                      filledRisk.current = null;
                      setRiskPercent(event.target.value);
                    }}
                  />
                </Field>
              </div>
              {/* A plan only counts as complete with an invalidation rule, so it sits here, in the section that starts open. */}
              <div className="mt-3">
                <Field label={c.invalidation}>
                  <Textarea name="invalidationRule" placeholder={c.placeholders.invalidation} value={invalidation} onChange={(event) => setInvalidation(event.target.value)} />
                </Field>
                {chosen && (chosen.invalidationRules ?? []).length > 0 ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">{c.fromStrategy}</span>
                    {(chosen.invalidationRules ?? []).map((rule, index) => (
                      <button
                        key={`${index}:${rule}`}
                        type="button"
                        onClick={() => addInvalidationRule(rule)}
                        className="rounded-md border border-border px-2.5 py-1 text-start text-xs text-foreground transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {rule}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input name="newsChecked" type="checkbox" className="size-4 rounded" />
                  {c.newsChecked}
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input name="riskCalculated" type="checkbox" className="size-4 rounded" />
                  {c.riskCalculated}
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input name="strategyMatched" type="checkbox" className="size-4 rounded" />
                  {c.strategyMatched}
                </label>
              </div>
              {chosen && strategyItems.length > 0 ? (
                <div className="mt-3">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">{c.strategyChecklist(chosen.name)}</p>
                  <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                    {strategyItems.map((item) => (
                      <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="size-4 rounded"
                          checked={Boolean(ticked[item.key])}
                          onChange={(event) => setTicked((current) => ({ ...current, [item.key]: event.target.checked }))}
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </details>

            {/* Context */}
            <details className="group">
              <summary className="mb-3 flex cursor-pointer list-none items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
                <span>{c.contextSection}</span>
                <span className="ms-auto text-[10px] text-muted-foreground group-open:hidden">▼</span>
                <span className="ms-auto text-[10px] text-muted-foreground [display:none] group-open:inline">▲</span>
              </summary>
              <div className="grid gap-3">
                <Field label={c.news}>
                  <Textarea name="relevantNews" placeholder={c.placeholders.news} />
                </Field>
                <Field label={c.notes}>
                  <Textarea name="notes" placeholder={c.placeholders.notes} />
                </Field>
              </div>
            </details>

            {/* Where the plan steps over a limit. A polite live region, always in the page, so a screen reader announces what appears. */}
            <div
              role="status"
              aria-live="polite"
              className={violations.length > 0 ? "rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning" : undefined}
            >
              {violations.length > 0 ? (
                <>
                  <p className="flex items-center gap-2 text-xs font-semibold">
                    <AlertTriangle className="size-4" aria-hidden="true" />
                    {c.limitWarningTitle}
                  </p>
                  <ul className="mt-1 space-y-1 leading-6">
                    {violations.map((violation) => (
                      <li key={violation.code}>{describeViolation(violation, chosen?.name ?? null, locale)}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs">{c.warningOnly}</p>
                </>
              ) : null}
            </div>

            <Button disabled={saving}>{saving ? c.saving : c.save}</Button>
          </form>
        </SectionPanel>

        {loaded && plans.length === 0 ? (
          // The form is on this page, so the sentence points at it instead of linking away.
          <EmptyState title={c.emptyTitle} description={c.emptyDescription} />
        ) : plans.length === 0 && loadFailed ? (
          // The first load failed: the alert above says why, and a spinner would promise an answer that is not coming.
          null
        ) : (
          <SectionPanel title={c.table} description={c.tableDesc}>
            {plans.length === 0 ? (
              <LoadingState locale={locale} />
            ) : (
              <div className="space-y-3">
                {plans.map((plan) => {
                  const gaps = planGaps(plan);
                  const complete = gaps.length === 0;
                  const isConverting = convertingId === plan.id;
                  const isConvertBusy = convertBusyId === plan.id;
                  const chosenSide = explicitPlanSide(plan.checklist);
                  const tradeSide = tradePlanSide(plan);
                  const isOpen = plan.status !== "closed" && plan.status !== "canceled";
                  const isAttaching = attachingId === plan.id;
                  const activeStrategies = strategies.filter((strategy) => strategy.isActive !== false);
                  return (
                    <div key={plan.id} className="rounded-md border border-border bg-muted/20 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-semibold text-foreground">{plan.symbol}</span>
                            <Badge>{label(c.markets, plan.market)}</Badge>
                            <Badge tone={plan.status === "planned" ? "warning" : plan.status === "active" ? "success" : "default"}>
                              {label(c.statuses, plan.status)}
                            </Badge>
                            {chosenSide ? <Badge tone={chosenSide === "long" ? "success" : "danger"}>{c.sides[chosenSide]}</Badge> : null}
                            <Badge tone={complete ? "success" : "warning"}>
                              {complete ? (
                                <span className="flex items-center gap-1"><CheckCircle2 className="size-3" />{c.complete}</span>
                              ) : (
                                <span className="flex items-center gap-1"><Clock className="size-3" />{c.incomplete}</span>
                              )}
                            </Badge>
                            {plan.isSample ? <Badge>{c.sample}</Badge> : null}
                            {!plan.strategyId && (
                              <Badge tone="danger">
                                <span className="flex items-center gap-1"><XCircle className="size-3" />{c.unplanned}</span>
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{plan.bias}</p>
                          {!complete && (
                            <p className="mt-1 text-xs leading-5 text-warning">
                              {c.missing} {gaps.map((gap) => c.gaps[gap]).join(c.listSeparator)}
                            </p>
                          )}
                          {plan.strategy && (
                            <p className="mt-1 text-xs text-muted-foreground">{`${c.strategyLine} ${plan.strategy.name}`}</p>
                          )}
                          {plan.sizing ? (
                            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                                <Gauge className="size-3" aria-hidden="true" />
                                {c.sizingTitle}
                              </span>
                              <span>{c.sizingLots} <span dir="ltr">{formatLots(plan.sizing.totalVolume)}</span></span>
                              <span>{c.sizingLegs} <span dir="ltr">{plan.sizing.legs.length}</span></span>
                              <span>{c.sizingLoss} <span dir="ltr">{plan.sizing.lossAtStop.toFixed(2)}</span></span>
                            </p>
                          ) : null}
                          {isOpen && !plan.strategyId ? (
                            <div className="mt-2">
                              {isAttaching ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <Select
                                    aria-label={c.attachLabel(plan.symbol)}
                                    value={attachChoice}
                                    onChange={(event) => setAttachChoice(event.target.value)}
                                    className="min-h-9 w-auto max-w-64"
                                  >
                                    <option value="">{c.attachChoose}</option>
                                    {activeStrategies.map((strategy) => (
                                      <option key={strategy.id} value={strategy.id}>{optionText(strategy)}</option>
                                    ))}
                                  </Select>
                                  <Button type="button" className="min-h-9" disabled={!attachChoice || attachBusyId === plan.id} onClick={() => void attachStrategy(plan)}>
                                    {attachBusyId === plan.id ? c.attaching : c.attach}
                                  </Button>
                                  <Button type="button" variant="secondary" className="min-h-9" disabled={attachBusyId === plan.id} onClick={() => setAttachingId(null)}>
                                    {c.attachCancel}
                                  </Button>
                                </div>
                              ) : activeStrategies.length > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAttachChoice("");
                                    setAttachingId(plan.id);
                                  }}
                                  className="text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                >
                                  {c.attachStrategy}
                                </button>
                              ) : (
                                <Link href={`/${locale}/strategies`} className="text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                                  {c.createStrategy}
                                </Link>
                              )}
                            </div>
                          ) : null}
                        </div>
                        {isOpen && (
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/${locale}/risk?plan=${encodeURIComponent(plan.id)}`}
                              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary/40 hover:bg-primary/5"
                            >
                              <Gauge className="size-3.5" aria-hidden="true" />
                              {c.sizeIt}
                            </Link>
                            {/* A sample plan cannot be recorded as a trade: the sample rows go away with the first real trade. */}
                            {!plan.isSample && (
                              <button
                                type="button"
                                onClick={() => setConvertingId(isConverting ? null : plan.id)}
                                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary/40 hover:bg-primary/5"
                              >
                                <ArrowRightLeft className="size-3.5" aria-hidden="true" />
                                {c.convert}
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {isConverting && (
                        <form
                          onSubmit={(e) => convertPlan(plan, e)}
                          className="mt-4 rounded-md border border-primary/20 bg-primary/5 p-3"
                        >
                          <p className="mb-1 text-xs font-semibold text-muted-foreground">{c.convertDesc}</p>
                          {chosenSide ? (
                            <p className="mb-3 text-xs text-muted-foreground">{`${c.tradeSide}: ${c.sides[chosenSide]}`}</p>
                          ) : (
                            <div className="mb-3 max-w-sm">
                              <Field label={`${c.tradeSide} *`} hint={c.tradeSideOlderPlan}>
                                <Select name="direction" defaultValue={tradeSide} required>
                                  <option value="long">{c.sides.long}</option>
                                  <option value="short">{c.sides.short}</option>
                                </Select>
                              </Field>
                            </div>
                          )}
                          <div className="grid gap-3 sm:grid-cols-4">
                            <Field label={`${c.convertEntryPrice} *`}>
                              <Input name="entryPrice" required inputMode="decimal" placeholder="65000" />
                            </Field>
                            <Field label={`${c.convertQuantity} *`}>
                              <Input name="quantity" required inputMode="decimal" placeholder="0.1" />
                            </Field>
                            <Field label={c.convertExitPrice}>
                              <Input name="exitPrice" inputMode="decimal" placeholder="66000" />
                            </Field>
                            <Field label={c.convertFees}>
                              <Input name="fees" inputMode="decimal" placeholder="0" defaultValue="0" />
                            </Field>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <Button type="submit" variant="primary" disabled={isConvertBusy}>
                              <ArrowRightLeft className="me-1.5 size-3.5" aria-hidden="true" />
                              {isConvertBusy ? c.converting : c.convertSubmit}
                            </Button>
                            <Button type="button" variant="secondary" disabled={isConvertBusy} onClick={() => setConvertingId(null)}>
                              {c.convertCancel}
                            </Button>
                          </div>
                        </form>
                      )}

                      {plan.invalidationRule && !isConverting && (
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          <span className="font-semibold">{c.invalidationLabel} </span>
                          {plan.invalidationRule}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </SectionPanel>
        )}
      </div>
    </div>
  );
}
