"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { AuthRequiredState, LoadingState } from "@/components/ui/state";
import { apiFetch, isAuthError } from "@/lib/api/client";
import { tradePlanSide } from "@/lib/calculations/trade-plan-side";
import { formatDate } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";
import { PlanSizingPanel } from "./plan-sizing-panel";
import { isOpenPlan, openPlans, plannerPrefill, type DeskPlan, type DeskSettings, type PlanUpdate } from "./plan-sizing";
import { PositionPlanner, type PlannerHints } from "./position-planner";

const copy = {
  en: {
    sectionLabel: "Position planner for a plan",
    sizing: "Sizing this plan",
    backToPlan: "Back to the plan",
    noStrategy: "No strategy",
    sides: { long: "Long", short: "Short" },
    lastSized: (date: string) => `Last sized ${date}`,
    loading: "Loading your plan",
    pickerLabel: "Size one of your plans",
    pickerHint: "Picking a plan opens it in the planner below, filled in from the plan.",
    pickerPlaceholder: "Choose a plan",
    openPlans: "Open your plans",
    notices: {
      notFound: "That plan was not found: it may have been deleted. The planner below works on its own.",
      closed: "That plan is closed, so it can no longer be sized. The planner below works on its own.",
      canceled: "That plan is canceled, so it can no longer be sized. The planner below works on its own.",
      failed: "Your plans could not be loaded. Reload the page to try again. The planner below works on its own."
    },
    authTitle: "Sign in to size a plan",
    authDescription: "Your plans are saved in your account. The planner below works without signing in.",
    hints: {
      balanceAccount: "Taken from the starting balance in your settings.",
      balanceSizing: "Taken from the last time this plan was sized.",
      balanceNone: "Set your starting balance in Settings, or type your balance here.",
      riskStrategy: "Taken from the risk limit of the strategy.",
      riskAccount: "Taken from your default risk per trade in Settings.",
      entrySingle: (zone: string) => `Taken from the plan's entry zone (${zone}).`,
      entryMidpoint: (zone: string) => `Midpoint of the plan's entry zone (${zone}).`,
      entrySizing: "Taken from the last time this plan was sized.",
      entryNone: (zone: string) => `The plan's entry zone (${zone}) is not a single price. Type the price you will size from.`,
      entryOutside: (zone: string) => `The plan's entry zone (${zone}) does not fit the plan's stop loss and take profit, so it was not used. Type the price you will size from.`,
      symbolCustom: (symbol: string) => `${symbol} has no preset here: enter its contract spec below.`,
      directionGuessed: "This plan has no saved direction: it is guessed from the bias. Check it."
    }
  },
  fa: {
    sectionLabel: "برنامه‌ریز حجم برای یک پلن",
    sizing: "تعیین حجم این پلن",
    backToPlan: "بازگشت به پلن",
    noStrategy: "بدون استراتژی",
    sides: { long: "لانگ", short: "شورت" },
    lastSized: (date: string) => `آخرین محاسبه حجم: ${date}`,
    loading: "در حال بارگذاری پلن",
    pickerLabel: "تعیین حجم برای یکی از پلن‌هایتان",
    pickerHint: "با انتخاب یک پلن، همین‌جا در برنامه‌ریز پایین باز می‌شود و از روی پلن پر می‌شود.",
    pickerPlaceholder: "یک پلن را انتخاب کنید",
    openPlans: "باز کردن پلن‌ها",
    notices: {
      notFound: "این پلن پیدا نشد؛ ممکن است حذف شده باشد. برنامه‌ریز پایین به‌تنهایی کار می‌کند.",
      closed: "این پلن بسته شده است و دیگر نمی‌توان حجمش را حساب کرد. برنامه‌ریز پایین به‌تنهایی کار می‌کند.",
      canceled: "این پلن لغو شده است و دیگر نمی‌توان حجمش را حساب کرد. برنامه‌ریز پایین به‌تنهایی کار می‌کند.",
      failed: "پلن‌های شما بارگذاری نشد. صفحه را دوباره باز کنید. برنامه‌ریز پایین به‌تنهایی کار می‌کند."
    },
    authTitle: "برای تعیین حجم یک پلن وارد شوید",
    authDescription: "پلن‌های شما در حسابتان ذخیره‌اند. برنامه‌ریز پایین بدون ورود هم کار می‌کند.",
    hints: {
      balanceAccount: "از موجودی اولیه حساب در تنظیمات برداشته شد.",
      balanceSizing: "از آخرین باری که حجم این پلن حساب شد برداشته شد.",
      balanceNone: "موجودی اولیه را در تنظیمات ثبت کنید یا موجودی خود را همین‌جا بنویسید.",
      riskStrategy: "از سقف ریسک استراتژی برداشته شد.",
      riskAccount: "از ریسک پیش‌فرض هر معامله در تنظیمات برداشته شد.",
      entrySingle: (zone: string) => `از ناحیه ورود پلن (${zone}) برداشته شد.`,
      entryMidpoint: (zone: string) => `میانه ناحیه ورود پلن (${zone}).`,
      entrySizing: "از آخرین باری که حجم این پلن حساب شد برداشته شد.",
      entryNone: (zone: string) => `ناحیه ورود پلن (${zone}) یک قیمت مشخص نیست. قیمتی را که حجم را از روی آن حساب می‌کنید بنویسید.`,
      entryOutside: (zone: string) => `ناحیه ورود پلن (${zone}) با حد ضرر و حد سود پلن جور نیست، پس برداشته نشد. قیمتی را که حجم را از روی آن حساب می‌کنید بنویسید.`,
      symbolCustom: (symbol: string) => `نماد ${symbol} پیش‌فرض آماده ندارد؛ مشخصات قرارداد را در فیلدهای پایین وارد کنید.`,
      directionGuessed: "این پلن جهت ذخیره‌شده ندارد و جهت از روی متن دیدگاه حدس زده شد. آن را بررسی کنید."
    }
  }
} as const;

type Copy = (typeof copy)[Locale];
type Problem = "auth" | "failed" | "notFound" | "closed" | "canceled";
type View = { kind: "standalone" } | { kind: "loading" } | { kind: "ready"; plan: DeskPlan } | { kind: "problem"; problem: Problem };

const LINK_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold text-foreground transition hover:bg-muted";

/** When the plan was last sized, from the stored sizing (null when it holds no usable time). */
function lastSizedAt(sizing: unknown): string | null {
  const value = typeof sizing === "object" && sizing !== null ? (sizing as { sizedAt?: unknown }).sizedAt : null;
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime()) ? value : null;
}

const planSideOf = (plan: DeskPlan) => tradePlanSide({ bias: plan.bias, checklist: plan.checklist ?? null });

function pickerLabel(plan: DeskPlan, c: Copy) {
  const bias = plan.bias.length > 40 ? `${plan.bias.slice(0, 40).trimEnd()}…` : plan.bias;
  return `${plan.symbol} · ${c.sides[planSideOf(plan)]} · ${plan.strategy?.name ?? bias}`;
}

/**
 * The risk desk's position planner: on its own, or sizing one of the person's plans (`?plan=<id>`). It loads the plan
 * list and the account's settings itself; when anything fails the planner still works on its own.
 */
export function PlanRiskDesk({ locale, planId }: { locale: Locale; planId: string | null }) {
  const c = copy[locale];
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [plans, setPlans] = useState<DeskPlan[] | null>(null);
  const [settings, setSettings] = useState<DeskSettings | null>(null);
  const [plansError, setPlansError] = useState<unknown>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const focusedFor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [plansResult, settingsResult] = await Promise.allSettled([
        apiFetch<{ tradePlans: DeskPlan[] }>("/api/trade-plans"),
        apiFetch<{ settings: DeskSettings }>("/api/users/me/settings")
      ]);
      if (cancelled) return;
      if (plansResult.status === "fulfilled" && Array.isArray(plansResult.value?.tradePlans)) setPlans(plansResult.value.tradePlans);
      else setPlansError(plansResult.status === "rejected" ? plansResult.reason : new Error("Unexpected response"));
      if (settingsResult.status === "fulfilled" && settingsResult.value?.settings) setSettings(settingsResult.value.settings);
      setLoaded(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Opened from a plan: bring the planner into view and move focus to it once it shows the plan (or says why not).
  useEffect(() => {
    if (!planId || !loaded || focusedFor.current === planId) return;
    focusedFor.current = planId;
    const section = sectionRef.current;
    if (!section) return;
    if (typeof section.scrollIntoView === "function") section.scrollIntoView({ block: "start" });
    section.focus({ preventScroll: true });
  }, [planId, loaded]);

  function view(): View {
    if (!planId) return { kind: "standalone" };
    if (!loaded) return { kind: "loading" };
    if (plansError) return { kind: "problem", problem: isAuthError(plansError) ? "auth" : "failed" };
    const plan = plans?.find((candidate) => candidate.id === planId);
    if (!plan) return { kind: "problem", problem: "notFound" };
    if (isOpenPlan(plan)) return { kind: "ready", plan };
    return { kind: "problem", problem: plan.status === "canceled" ? "canceled" : "closed" };
  }
  const current = view();

  /** What was just saved is the plan now: the strip and the limits read it, without asking the server again. */
  function saved(update: PlanUpdate) {
    setPlans((previous) =>
      previous
        ? previous.map((plan) =>
            plan.id === update.id
              ? { ...plan, stopLoss: update.stopLoss, takeProfit: update.takeProfit, riskPercent: update.riskPercent, riskAmount: update.riskAmount, sizing: update.sizing, checklist: update.checklist }
              : plan
          )
        : previous
    );
  }

  const choosable = current.kind === "ready" || !plans ? [] : openPlans(plans);
  const startingBalance = Number(settings?.startingBalance);
  const standalonePrefill = startingBalance > 0 ? { balance: String(startingBalance) } : null;

  return (
    <section
      ref={sectionRef}
      aria-label={planId ? c.sectionLabel : undefined}
      tabIndex={planId ? -1 : undefined}
      className="space-y-4 focus:outline-none"
    >
      {current.kind === "problem" ? <Notice locale={locale} problem={current.problem} c={c} /> : null}

      {choosable.length > 0 ? (
        <div className="rounded-md border border-border bg-muted/20 p-4">
          <Field label={c.pickerLabel} hint={c.pickerHint}>
            <Select
              aria-label={c.pickerLabel}
              value=""
              onChange={(event) => {
                if (event.target.value) router.push(`/${locale}/risk?plan=${encodeURIComponent(event.target.value)}`);
              }}
            >
              <option value="">{c.pickerPlaceholder}</option>
              {choosable.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {pickerLabel(plan, c)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : null}

      {current.kind === "loading" ? <LoadingState label={c.loading} locale={locale} /> : null}
      {current.kind === "ready" ? <PlanSession key={current.plan.id} locale={locale} plan={current.plan} settings={settings} onSaved={saved} /> : null}
      {current.kind === "standalone" || current.kind === "problem" ? <PositionPlanner locale={locale} prefill={standalonePrefill} /> : null}
    </section>
  );
}

function Notice({ locale, problem, c }: { locale: Locale; problem: Problem; c: Copy }) {
  if (problem === "auth") return <AuthRequiredState locale={locale} title={c.authTitle} description={c.authDescription} />;
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/30 bg-warning/10 p-4 text-sm leading-6 text-foreground">
      <p className="min-w-0 flex-1">{c.notices[problem]}</p>
      <Link href={`/${locale}/plans`} className={LINK_CLASS}>
        {c.openPlans}
      </Link>
    </div>
  );
}

/** A plan being sized: the strip that names it, and the planner filled in from it. */
function PlanSession({ locale, plan, settings, onSaved }: { locale: Locale; plan: DeskPlan; settings: DeskSettings | null; onSaved: (update: PlanUpdate) => void }) {
  const c = copy[locale];
  // The planner starts from the plan as it was opened; saving later must not refill it or change what its hints say.
  const [start] = useState(() => plannerPrefill(plan, settings));
  const { sources } = start;

  const hints: PlannerHints = {};
  if (sources.symbol === "custom") hints.symbol = c.hints.symbolCustom(plan.symbol);
  if (sources.direction === "guessed") hints.direction = c.hints.directionGuessed;
  if (sources.balance === "account") hints.balance = c.hints.balanceAccount;
  if (sources.balance === "sizing") hints.balance = c.hints.balanceSizing;
  if (sources.balance === "none") hints.balance = c.hints.balanceNone;
  if (sources.risk === "strategy") hints.risk = c.hints.riskStrategy;
  if (sources.risk === "account") hints.risk = c.hints.riskAccount;
  if (sources.entry === "single") hints.entry = c.hints.entrySingle(sources.entryZone);
  if (sources.entry === "midpoint") hints.entry = c.hints.entryMidpoint(sources.entryZone);
  if (sources.entry === "sizing") hints.entry = c.hints.entrySizing;
  if (sources.entry === "none") hints.entry = c.hints.entryNone(sources.entryZone);
  if (sources.entry === "outside") hints.entry = c.hints.entryOutside(sources.entryZone);

  const sizedAt = lastSizedAt(plan.sizing);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{c.sizing}</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            <span dir="ltr">{plan.symbol}</span>
            {` · ${c.sides[planSideOf(plan)]} · ${plan.strategy?.name ?? c.noStrategy}`}
          </p>
          {sizedAt ? <p className="mt-1 text-xs text-muted-foreground">{c.lastSized(formatDate(sizedAt, locale))}</p> : null}
        </div>
        <Link href={`/${locale}/plans`} className={LINK_CLASS}>
          {c.backToPlan}
        </Link>
      </div>
      <PositionPlanner
        locale={locale}
        prefill={start.prefill}
        hints={hints}
        footer={(snapshot) => <PlanSizingPanel locale={locale} plan={plan} settings={settings} snapshot={snapshot} onSaved={onSaved} />}
      />
    </>
  );
}
