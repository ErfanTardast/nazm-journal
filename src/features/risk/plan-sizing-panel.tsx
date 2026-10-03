"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { apiErrorText } from "@/lib/api/error-text";
import type { LimitSource, PlanRiskViolation } from "@/lib/calculations/plan-risk-check";
import { formatMoney } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";
import { localizeDigits } from "@/lib/services/locale";
import {
  buildPlanUpdate,
  planLimits,
  sizedAgainstPlan,
  sizingViolations,
  tickAdjustedPrices,
  type DeskPlan,
  type DeskSettings,
  type PlanUpdate,
  type PlannerSnapshot
} from "./plan-sizing";

const quote = (locale: Locale, name: string) => (locale === "fa" ? `«${name}»` : `“${name}”`);

const copy = {
  en: {
    limitsTitle: "Limits for this plan",
    limitLabels: { riskPerTradePct: "Risk per trade", maxDailyLossPct: "Daily loss", maxOpenPositions: "Open positions" },
    limitLine: (label: string, value: string, source: string) => `${label}: at most ${value} (${source})`,
    sourceStrategy: (name: string) => `strategy ${quote("en", name)}`,
    sourceAccount: "your account settings",
    openNote: "The open-positions limit is checked against this plan's own positions only.",
    noLimits: "No risk limit applies to this plan. Set one on its strategy or in Settings.",
    warningsLabel: "Risk limit warnings",
    within: "These numbers are inside every limit above.",
    warningNote: "A warning only: you can still save.",
    violation: {
      risk_per_trade: (actual: string, limit: string, source: string) => `Risk per trade is ${actual}, above the ${limit} limit (${source}).`,
      daily_loss: (actual: string, limit: string, source: string) => `This trade risks ${actual} of the account, above the ${limit} daily loss limit (${source}).`,
      open_positions: (actual: string, limit: string, source: string) => `This plan opens ${actual} positions, above the limit of ${limit} open positions (${source}).`
    },
    sides: { long: "Long", short: "Short" },
    // The planner's own direction words, so the line names what is on screen in the Direction field.
    planner: { buy: "Buy", sell: "Sell" },
    mismatch: (sized: string, planned: string) => `${quote("en", sized)} is selected here, but this plan is a ${planned}. Set the same direction here, or change it on the plan, to save.`,
    save: "Save to plan",
    saving: "Saving...",
    saveHint: "Stores the stop loss, take profit, risk and this sizing in the plan, and ticks “Risk amount calculated”.",
    tickNote: (entry: string, stopLoss: string, takeProfit: string) =>
      `Prices are saved rounded to the symbol's tick size: entry ${entry}, stop loss ${stopLoss}, take profit ${takeProfit}.`,
    saved: (lots: string, loss: string) => `Saved to the plan: ${lots} lots in total, a ${loss} loss at the stop.`,
    backToPlan: "Back to the plan",
    tooMany: "A plan can store at most 20 positions.",
    fieldLabels: { sizing: "Sizing", stopLoss: "Stop loss", takeProfit: "Take profit", riskPercent: "Risk %", riskAmount: "Risk amount" } as Record<string, string>,
    errors: {
      conflict: "This plan was changed somewhere else since this page loaded (converted to a trade, closed or canceled), so nothing was saved.",
      notFound: "This plan no longer exists, so nothing was saved.",
      rateLimited: "Too many attempts. Wait a minute and try again.",
      network: "Could not reach the server. Check your connection and try again.",
      auth: "Your session has ended. Sign in again, then save.",
      generic: "The sizing could not be saved. Try again in a moment."
    }
  },
  fa: {
    limitsTitle: "سقف‌های این پلن",
    limitLabels: { riskPerTradePct: "ریسک هر معامله", maxDailyLossPct: "زیان روزانه", maxOpenPositions: "پوزیشن‌های باز" },
    limitLine: (label: string, value: string, source: string) => `${label}: حداکثر ${value} (${source})`,
    sourceStrategy: (name: string) => `استراتژی ${quote("fa", name)}`,
    sourceAccount: "تنظیمات حساب شما",
    openNote: "سقف پوزیشن‌های باز فقط با پوزیشن‌های همین پلن سنجیده می‌شود.",
    noLimits: "هیچ سقف ریسکی برای این پلن تعریف نشده است. آن را روی استراتژی یا در تنظیمات بگذارید.",
    warningsLabel: "هشدارهای سقف ریسک",
    within: "این اعداد از هیچ‌یک از سقف‌های بالا فراتر نمی‌روند.",
    warningNote: "فقط هشدار است؛ همچنان می‌توانید ذخیره کنید.",
    violation: {
      risk_per_trade: (actual: string, limit: string, source: string) => `ریسک هر معامله ${actual} است و از سقف ${limit} (${source}) بیشتر است.`,
      daily_loss: (actual: string, limit: string, source: string) => `این معامله ${actual} از حساب را در معرض ریسک می‌گذارد و از سقف زیان روزانه ${limit} (${source}) بیشتر است.`,
      open_positions: (actual: string, limit: string, source: string) => `این پلن ${actual} پوزیشن باز می‌کند و از سقف ${limit} پوزیشن باز (${source}) بیشتر است.`
    },
    sides: { long: "لانگ", short: "شورت" },
    planner: { buy: "خرید", sell: "فروش" },
    mismatch: (sized: string, planned: string) => `اینجا ${quote("fa", sized)} انتخاب شده، ولی این پلن ${planned} است. برای ذخیره، جهت را همین‌جا یا روی پلن یکی کنید.`,
    save: "ذخیره در پلن",
    saving: "در حال ذخیره...",
    saveHint: "حد ضرر، حد سود، ریسک و همین محاسبه را در پلن ذخیره می‌کند و «مبلغ ریسک محاسبه شد» را تیک می‌زند.",
    tickNote: (entry: string, stopLoss: string, takeProfit: string) =>
      `قیمت‌ها بر اساس اندازه تیک نماد گرد می‌شوند و به این صورت ذخیره می‌شوند: ورود ${entry}، حد ضرر ${stopLoss}، حد سود ${takeProfit}.`,
    saved: (lots: string, loss: string) => `در پلن ذخیره شد: ${lots} لات در مجموع، با زیان ${loss} در حد ضرر.`,
    backToPlan: "بازگشت به پلن",
    tooMany: "یک پلن حداکثر ۲۰ پوزیشن را نگه می‌دارد.",
    fieldLabels: { sizing: "محاسبه حجم", stopLoss: "حد ضرر", takeProfit: "حد سود", riskPercent: "درصد ریسک", riskAmount: "مبلغ ریسک" } as Record<string, string>,
    errors: {
      conflict: "این پلن بعد از باز شدن این صفحه در جای دیگری تغییر کرده است (به معامله تبدیل، بسته یا لغو شده)، پس چیزی ذخیره نشد.",
      notFound: "این پلن دیگر وجود ندارد، پس چیزی ذخیره نشد.",
      rateLimited: "تعداد تلاش‌ها بیش از حد مجاز است. یک دقیقه صبر کنید و دوباره امتحان کنید.",
      network: "اتصال به سرور برقرار نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.",
      auth: "نشست شما تمام شده است. دوباره وارد شوید و بعد ذخیره کنید.",
      generic: "ذخیره محاسبه ممکن نشد. کمی بعد دوباره تلاش کنید."
    }
  }
} as const;

type Copy = (typeof copy)[Locale];

/** A number the way the page writes numbers: Persian digits on the Persian page, at most two decimals. */
const formatNumber = (value: number, locale: Locale) => new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", { maximumFractionDigits: 2 }).format(value);
const formatPercent = (value: number, locale: Locale) => `${formatNumber(value, locale)}${locale === "fa" ? "٪" : "%"}`;

/** A price without trailing zeros, in the digits of the page ("2640.13", "۲۶۴۰٫۱۳"). */
const price = (value: number, locale: Locale) => localizeDigits(value.toFixed(10).replace(/\.?0+$/, ""), locale);

/** The sizing without the moment it was made: two sizings with the same numbers have the same signature. */
const signature = (update: PlanUpdate) => JSON.stringify({ ...update.sizing, sizedAt: undefined });

type SaveFailure = { text: string; final: boolean };

/** A failed save in the page language, chosen by what happened (the server's own text is never shown). */
function saveFailure(error: unknown, locale: Locale, c: Copy): SaveFailure {
  if (error instanceof TypeError) return { text: c.errors.network, final: false };
  const { status, code } = (error ?? {}) as { status?: unknown; code?: unknown };
  // A plan that was converted, closed, canceled or deleted elsewhere stays that way: another try cannot succeed.
  if (status === 409 || code === "CONFLICT") return { text: c.errors.conflict, final: true };
  if (status === 404 || code === "NOT_FOUND") return { text: c.errors.notFound, final: true };
  if (status === 429 || code === "RATE_LIMITED") return { text: c.errors.rateLimited, final: false };
  if (status === 401) return { text: c.errors.auth, final: false };
  if (status === 422 || code === "VALIDATION_ERROR") return { text: apiErrorText(error, locale, c.errors.generic, c.fieldLabels), final: false };
  return { text: c.errors.generic, final: false };
}

/**
 * What goes under the planner when it is sizing a plan: the limits that apply, a warning (never a block) when the
 * numbers step over them, and the button that stores the result inside the plan.
 */
export function PlanSizingPanel({
  locale,
  plan,
  settings,
  snapshot,
  onSaved
}: {
  locale: Locale;
  plan: DeskPlan;
  settings: DeskSettings | null;
  snapshot: PlannerSnapshot;
  onSaved: (update: PlanUpdate) => void;
}) {
  const c = copy[locale];
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ signature: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  // State updates are asynchronous, so a second click in the same moment is stopped here.
  const running = useRef(false);

  const limits = planLimits(plan, settings);
  const violations = sizingViolations(limits, snapshot.riskPercent, snapshot.positions);
  const update = buildPlanUpdate(plan, snapshot, new Date());
  const hasLimits = Boolean(limits.riskPerTradePct || limits.maxDailyLossPct || limits.maxOpenPositions);
  const riskKnown = Number.isFinite(snapshot.riskPercent) && snapshot.riskPercent > 0;
  const tooManyLegs = snapshot.result.ok && snapshot.result.plan.legs.length > 20;
  // The plan's own side when the planner is sizing the other one: then there is no update to save (see `buildPlanUpdate`).
  const plannedSide = sizedAgainstPlan(plan, snapshot.direction);
  const rounded = tickAdjustedPrices(snapshot);
  const savedNow = saved && update && saved.signature === signature(update) ? saved : null;

  const sourceText = (source: LimitSource) => (source === "strategy" ? c.sourceStrategy(plan.strategy?.name ?? "") : c.sourceAccount);
  const limitRows = [
    limits.riskPerTradePct && { key: "riskPerTradePct", text: c.limitLine(c.limitLabels.riskPerTradePct, formatPercent(limits.riskPerTradePct.value, locale), sourceText(limits.riskPerTradePct.source)) },
    limits.maxDailyLossPct && { key: "maxDailyLossPct", text: c.limitLine(c.limitLabels.maxDailyLossPct, formatPercent(limits.maxDailyLossPct.value, locale), sourceText(limits.maxDailyLossPct.source)) },
    limits.maxOpenPositions && { key: "maxOpenPositions", text: c.limitLine(c.limitLabels.maxOpenPositions, formatNumber(limits.maxOpenPositions.value, locale), sourceText(limits.maxOpenPositions.source)) }
  ].filter((row): row is { key: string; text: string } => Boolean(row));

  function violationText(violation: PlanRiskViolation) {
    const asPercent = violation.code !== "open_positions";
    const format = (value: number) => (asPercent ? formatPercent(value, locale) : formatNumber(value, locale));
    return c.violation[violation.code](format(violation.actual), format(violation.limit), sourceText(violation.source));
  }

  async function save() {
    if (running.current) return;
    const body = buildPlanUpdate(plan, snapshot, new Date());
    if (!body) return;
    running.current = true;
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      await apiFetch("/api/trade-plans", { method: "PATCH", body: JSON.stringify(body) });
      const lots = localizeDigits(body.sizing.totalVolume.toFixed(snapshot.lotDigits), locale);
      setSaved({ signature: signature(body), text: c.saved(lots, formatMoney(body.sizing.lossAtStop, locale)) });
      onSaved(body);
    } catch (err) {
      const failure = saveFailure(err, locale, c);
      setError(failure.text);
      if (failure.final) setBlocked(true);
    } finally {
      running.current = false;
      setSaving(false);
    }
  }

  return (
    <>
      <div>
        <p className="text-sm font-semibold text-foreground">{c.limitsTitle}</p>
        {limitRows.length > 0 ? (
          <>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {limitRows.map((row) => (
                <li key={row.key}>{row.text}</li>
              ))}
            </ul>
            {limits.maxOpenPositions ? <p className="mt-2 text-xs text-muted-foreground">{c.openNote}</p> : null}
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{c.noLimits}</p>
        )}
      </div>

      {/* Kept on the page even when empty, so a screen reader announces a warning the moment it appears. */}
      <div role="status" aria-live="polite" aria-label={c.warningsLabel} className="space-y-2">
        {violations.length > 0 ? (
          <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm leading-6 text-foreground">
            <ul className="space-y-1">
              {violations.map((violation) => (
                <li key={violation.code}>{violationText(violation)}</li>
              ))}
            </ul>
            {/* Only while a save is possible: with no valid result, or a blocked plan, "you can still save" would be false. */}
            {update && !blocked ? <p className="mt-2 text-xs text-muted-foreground">{c.warningNote}</p> : null}
          </div>
        ) : null}
        {plannedSide ? (
          <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm leading-6 text-foreground">{c.mismatch(c.planner[snapshot.direction], c.sides[plannedSide])}</p>
        ) : null}
        {violations.length === 0 && hasLimits && riskKnown ? <p className="text-sm text-muted-foreground">{c.within}</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={!update || saving || blocked} onClick={() => void save()}>
          {saving ? c.saving : c.save}
        </Button>
        <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">{c.saveHint}</p>
      </div>
      {rounded ? (
        <p className="text-xs leading-5 text-muted-foreground">
          {c.tickNote(price(rounded.entry, locale), price(rounded.stopLoss, locale), price(rounded.finalTp, locale))}
        </p>
      ) : null}
      {tooManyLegs ? <p className="text-sm text-muted-foreground">{c.tooMany}</p> : null}
      {error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {savedNow ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-success/30 bg-success/10 p-3 text-sm text-foreground">
          <p>{savedNow.text}</p>
          <Link
            href={`/${locale}/plans`}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            {c.backToPlan}
          </Link>
        </div>
      ) : null}
    </>
  );
}
