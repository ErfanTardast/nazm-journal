"use client";

import { useState, type FormEvent } from "react";
import { Calculator, RotateCcw, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, type InputProps } from "@/components/ui/input";
import { SectionPanel } from "@/components/ui/section-panel";
import { Select } from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { apiFetch } from "@/lib/api/client";
import { apiErrorText, rejectedFields, rejectedMessages } from "@/lib/api/error-text";
import { formatMoney, formatPercent } from "@/lib/i18n/format";
import { t, type getMessages } from "@/lib/i18n/messages";
import { localizeDigits } from "@/lib/services/locale";
import type { Locale } from "@/lib/i18n/locales";

type Messages = ReturnType<typeof getMessages>;
type CalculatorKey = "positionSize" | "forexLotSize" | "liquidation" | "rewardRisk" | "stopLossDistance";
type CalculatorResult = Record<string, unknown> & {
  warning?: string;
};

const CALCULATORS: CalculatorKey[] = ["positionSize", "forexLotSize", "liquidation", "rewardRisk", "stopLossDistance"];

/** The rule the server enforces on a stop that sits on the entry price (see validation/trading.ts). */
const STOP_ON_ENTRY_MESSAGE = /stop loss must be different from the entry price/i;

const copy = {
  en: {
    eyebrow: "Risk desk",
    description:
      "Quick risk calculators, and below them the position planner: open one of your plans there to size it, check it against your risk limits and save the result into the plan.",
    disclaimer: "Educational calculators only. They support planning discipline and do not provide financial advice or profit expectations.",
    calculate: "Calculate",
    calculating: "Calculating...",
    reset: "Reset",
    assumptions: "Assumptions",
    assumptionsDesc: "Use conservative numbers. These calculators do not save anything: to keep a sizing, use the position planner below on one of your plans.",
    result: "Calculator output",
    resultDesc: "Validated backend calculation with deterministic formatting.",
    emptyResult: "Run a calculator to see the output.",
    guardrails: "Risk guardrails",
    guardrailsDesc: "Suggested desk rules for consistency, not market predictions.",
    guardrailItems: [
      { label: "Single trade risk", value: "0.5% - 1.0%", tone: "success" },
      { label: "Daily stop", value: "2R or 3 losses", tone: "warning" },
      { label: "Review trigger", value: "Rule broken", tone: "danger" },
      { label: "Confidence log", value: "1-10 score", tone: "default" }
    ] as { label: string; value: string; tone: "success" | "warning" | "danger" | "default" }[],
    checklistTitle: "Desk checklist",
    checklistItems: [
      "Confirm the risk percentage before journaling a trade.",
      "Compare stop distance against the current volatility regime.",
      "Record whether the plan rules were followed after the trade closes."
    ],
    meta: {
      positionSize: { label: "Position", description: "Account risk, entry, stop, and fee buffer." },
      forexLotSize: { label: "Forex", description: "Pip distance and lot sizing." },
      liquidation: { label: "Liquidation", description: "Leverage distance estimate." },
      rewardRisk: { label: "R:R", description: "Reward/risk ratio from price levels." },
      stopLossDistance: { label: "Stop", description: "Absolute and percentage distance." }
    } as Record<CalculatorKey, { label: string; description: string }>,
    fields: {
      accountBalance: "Account balance",
      riskPercent: "Risk %",
      entryPrice: "Entry price",
      stopLoss: "Stop loss",
      feeBuffer: "Fee buffer",
      stopLossPips: "Stop distance pips",
      pipValuePerStandardLot: "Pip value per standard lot",
      side: "Side",
      long: "Long",
      short: "Short",
      leverage: "Leverage",
      maintenanceMarginPercent: "Maintenance margin %",
      takeProfit: "Take profit"
    },
    results: {
      riskAmount: "Risk Amount",
      stopDistance: "Stop Distance",
      quantity: "Quantity",
      notionalValue: "Notional Value",
      standardLots: "Standard Lots",
      miniLots: "Mini Lots",
      microLots: "Micro Lots",
      liquidationPrice: "Liquidation Price",
      distance: "Distance",
      distancePercent: "Distance Percent",
      riskDistance: "Risk Distance",
      rewardDistance: "Reward Distance",
      rewardRiskRatio: "Reward Risk Ratio"
    } as Record<string, string>,
    warnings: {} as Record<string, string>,
    failed: "The calculation failed. Try again in a moment.",
    stopOnEntry: "Stop loss must be different from the entry price, otherwise there is no risk distance to calculate.",
    invalidNumbers: "Some values are not valid. Fill every field with a positive number and stay inside the limits (for example, risk % can be at most 100)."
  },
  fa: {
    eyebrow: "میز ریسک",
    description:
      "ماشین‌حساب‌های سریع ریسک، و پایین‌تر برنامه‌ریز حجم: یکی از پلن‌هایتان را در آن باز کنید تا حجمش را حساب کنید، آن را با سقف‌های ریسک‌تان بسنجید و نتیجه را در خود پلن ذخیره کنید.",
    disclaimer: "این ماشین‌حساب‌ها آموزشی هستند و فقط به نظم برنامه‌ریزی کمک می‌کنند؛ توصیه مالی یا انتظار سود ارائه نمی‌شود.",
    calculate: "محاسبه",
    calculating: "در حال محاسبه...",
    reset: "بازنشانی",
    assumptions: "فرضیات",
    assumptionsDesc: "از اعداد محافظه‌کارانه استفاده کنید. این ماشین‌حساب‌ها چیزی ذخیره نمی‌کنند: برای نگه‌داشتن نتیجه، پایین‌تر در برنامه‌ریز حجم، حجم یکی از پلن‌هایتان را حساب و در همان پلن ذخیره کنید.",
    result: "خروجی ماشین‌حساب",
    resultDesc: "محاسبه اعتبارسنجی‌شده در بک‌اند با نمایش قطعی.",
    emptyResult: "یک ماشین‌حساب را اجرا کنید تا خروجی نمایش داده شود.",
    guardrails: "چارچوب‌های ریسک",
    guardrailsDesc: "قواعد پیشنهادی برای ثبات، نه پیش‌بینی بازار.",
    guardrailItems: [
      { label: "ریسک هر معامله", value: "۰٫۵٪ تا ۱٫۰٪", tone: "success" },
      { label: "توقف روزانه", value: "۲R یا ۳ ضرر", tone: "warning" },
      { label: "محرک مرور", value: "نقض قانون", tone: "danger" },
      { label: "ثبت اطمینان", value: "امتیاز ۱ تا ۱۰", tone: "default" }
    ] as { label: string; value: string; tone: "success" | "warning" | "danger" | "default" }[],
    checklistTitle: "چک‌لیست میز ریسک",
    checklistItems: [
      "قبل از ثبت معامله در ژورنال، درصد ریسک را تأیید کنید.",
      "فاصله حد ضرر را با نوسان فعلی بازار مقایسه کنید.",
      "بعد از بسته شدن معامله ثبت کنید که قوانین پلن رعایت شده یا نه."
    ],
    meta: {
      positionSize: { label: "اندازه پوزیشن", description: "ریسک حساب، ورود، حد ضرر و بافر کارمزد." },
      forexLotSize: { label: "فارکس", description: "فاصله پیپ و اندازه لات." },
      liquidation: { label: "لیکوییدیشن", description: "برآورد فاصله با توجه به اهرم." },
      rewardRisk: { label: "R:R", description: "نسبت پاداش به ریسک از روی سطوح قیمت." },
      stopLossDistance: { label: "حد ضرر", description: "فاصله مطلق و درصدی." }
    } as Record<CalculatorKey, { label: string; description: string }>,
    fields: {
      accountBalance: "موجودی حساب",
      riskPercent: "درصد ریسک",
      entryPrice: "قیمت ورود",
      stopLoss: "حد ضرر",
      feeBuffer: "بافر کارمزد",
      stopLossPips: "فاصله حد ضرر (پیپ)",
      pipValuePerStandardLot: "ارزش هر پیپ برای یک لات استاندارد",
      side: "جهت",
      long: "لانگ",
      short: "شورت",
      leverage: "اهرم",
      maintenanceMarginPercent: "درصد مارجین نگهداری",
      takeProfit: "حد سود"
    },
    results: {
      riskAmount: "مقدار ریسک",
      stopDistance: "فاصله حد ضرر",
      quantity: "حجم",
      notionalValue: "ارزش اسمی",
      standardLots: "لات استاندارد",
      miniLots: "مینی‌لات",
      microLots: "میکرولات",
      liquidationPrice: "قیمت لیکوییدیشن",
      distance: "فاصله",
      distancePercent: "فاصله (درصد)",
      riskDistance: "فاصله ریسک",
      rewardDistance: "فاصله پاداش",
      rewardRiskRatio: "نسبت پاداش به ریسک"
    } as Record<string, string>,
    // The calculator service answers in English; these are its fixed sentences.
    warnings: {
      "These calculators support planning and discipline only. They do not recommend buying, selling, or placing orders.":
        "این ماشین‌حساب‌ها فقط به برنامه‌ریزی و نظم کمک می‌کنند و خرید، فروش یا ثبت سفارش را توصیه نمی‌کنند.",
      "High leverage can cause liquidation during normal volatility. This is an estimate for planning, not execution advice.":
        "اهرم بالا می‌تواند در نوسان عادی بازار به لیکوییدیشن منجر شود. این فقط یک برآورد برای برنامه‌ریزی است، نه توصیه اجرایی.",
      "This is an educational estimate. Trading venues use different maintenance margin formulas.":
        "این یک برآورد آموزشی است. بازارها و کارگزارها از فرمول‌های متفاوتی برای مارجین نگهداری استفاده می‌کنند."
    } as Record<string, string>,
    failed: "محاسبه انجام نشد. چند لحظه بعد دوباره تلاش کنید.",
    stopOnEntry: "حد ضرر باید با قیمت ورود فرق داشته باشد، وگرنه فاصله ریسکی برای محاسبه وجود ندارد.",
    invalidNumbers: "برخی مقادیر معتبر نیستند. همه فیلدها را با عدد مثبت پر کنید و محدوده‌ها را رعایت کنید (مثلاً درصد ریسک حداکثر ۱۰۰ است)."
  }
} as const;

export function RiskScreen({ locale, messages }: { locale: Locale; messages: Messages }) {
  const c = copy[locale];
  const [active, setActive] = useState<CalculatorKey>("positionSize");
  const [result, setResult] = useState<CalculatorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);

  const activeMeta = c.meta[active];

  /** A rejected calculation in the page language: the stop-on-entry rule by name, else the fields the server rejected. */
  function describeError(err: unknown) {
    if (rejectedMessages(err).some((message) => STOP_ON_ENTRY_MESSAGE.test(message))) return c.stopOnEntry;
    // The server nests a calculator's fields, so it often names only the calculator ("positionSize"), not the field.
    const names = rejectedFields(err);
    if (names.length > 0 && names.every((name) => name in c.meta)) return c.invalidNumbers;
    return apiErrorText(err, locale, c.failed, c.fields);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setCalculating(true);
    try {
      const payload = { [active]: Object.fromEntries(form) };
      const data = await apiFetch<{ result: Record<CalculatorKey, Record<string, unknown> | null> & { warning: string } }>("/api/risk/calculators", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const own = data.result[active] ?? {};
      setResult({
        ...own,
        // The estimate's own caution (liquidation) is more specific than the general one.
        warning: typeof own.warning === "string" ? own.warning : data.result.warning
      });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setCalculating(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={c.eyebrow} title={t(messages, "pages.risk")} description={c.description} />

      <div className="rounded-md border border-warning/30 bg-warning/10 p-4 text-sm leading-6 text-warning">
        <ShieldCheck className="me-2 inline h-4 w-4" />
        {c.disclaimer}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <SectionPanel title={c.assumptions} description={c.assumptionsDesc}>
            <div className="mb-4 grid gap-2 md:grid-cols-5">
              {CALCULATORS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`rounded-md border px-3 py-3 text-start transition ${
                    active === key ? "border-primary bg-primary/10 text-foreground" : "border-border bg-muted/30 text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => {
                    setActive(key);
                    setResult(null);
                    setError(null);
                  }}
                >
                  <span className="block text-sm font-semibold">{c.meta[key].label}</span>
                  <span className="mt-1 block text-xs leading-5">{c.meta[key].description}</span>
                </button>
              ))}
            </div>

            <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
              <CalculatorFields active={active} labels={c.fields} />
              <div className="flex flex-col gap-3 md:col-span-2 sm:flex-row">
                <Button disabled={calculating}>
                  <Calculator className="me-2 h-4 w-4" />
                  {calculating ? c.calculating : c.calculate}
                </Button>
                <Button
                  type="reset"
                  variant="secondary"
                  onClick={() => {
                    setResult(null);
                    setError(null);
                  }}
                >
                  <RotateCcw className="me-2 h-4 w-4" />
                  {c.reset}
                </Button>
              </div>
            </form>
          </SectionPanel>

          <SectionPanel title={c.result} description={`${c.resultDesc} ${activeMeta.description}`}>
            {error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
            {result ? <ResultGrid result={result} locale={locale} labels={c.results} warnings={c.warnings} /> : <p className="text-sm text-muted-foreground">{c.emptyResult}</p>}
          </SectionPanel>
        </div>

        <SectionPanel title={c.guardrails} description={c.guardrailsDesc}>
          <div className="space-y-3">
            {c.guardrailItems.map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <Badge tone={item.tone}>{item.value}</Badge>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-md border border-border bg-background/50 p-4">
            <p className="text-sm font-semibold text-foreground">{c.checklistTitle}</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
              {c.checklistItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </SectionPanel>
      </div>
    </div>
  );
}

type FieldLabels = Record<keyof (typeof copy)["en"]["fields"], string>;

/** A calculator number: typed left to right whatever the page language is. */
function NumberInput(props: Omit<InputProps, "inputMode" | "dir">) {
  return <Input dir="ltr" inputMode="decimal" {...props} />;
}

function CalculatorFields({ active, labels }: { active: CalculatorKey; labels: FieldLabels }) {
  if (active === "positionSize") {
    return (
      <>
        <Field label={labels.accountBalance}>
          <NumberInput name="accountBalance" defaultValue="25000" />
        </Field>
        <Field label={labels.riskPercent}>
          <NumberInput name="riskPercent" defaultValue="1" />
        </Field>
        <Field label={labels.entryPrice}>
          <NumberInput name="entryPrice" defaultValue="65000" />
        </Field>
        <Field label={labels.stopLoss}>
          <NumberInput name="stopLoss" defaultValue="64000" />
        </Field>
        <Field label={labels.feeBuffer}>
          <NumberInput name="feeBuffer" defaultValue="10" />
        </Field>
      </>
    );
  }

  if (active === "forexLotSize") {
    return (
      <>
        <Field label={labels.accountBalance}>
          <NumberInput name="accountBalance" defaultValue="25000" />
        </Field>
        <Field label={labels.riskPercent}>
          <NumberInput name="riskPercent" defaultValue="1" />
        </Field>
        <Field label={labels.stopLossPips}>
          <NumberInput name="stopLossPips" defaultValue="25" />
        </Field>
        <Field label={labels.pipValuePerStandardLot}>
          <NumberInput name="pipValuePerStandardLot" defaultValue="10" />
        </Field>
      </>
    );
  }

  if (active === "liquidation") {
    return (
      <>
        <Field label={labels.side}>
          <Select name="side" defaultValue="long">
            <option value="long">{labels.long}</option>
            <option value="short">{labels.short}</option>
          </Select>
        </Field>
        <Field label={labels.entryPrice}>
          <NumberInput name="entryPrice" defaultValue="65000" />
        </Field>
        <Field label={labels.leverage}>
          <NumberInput name="leverage" defaultValue="10" />
        </Field>
        <Field label={labels.maintenanceMarginPercent}>
          <NumberInput name="maintenanceMarginPercent" defaultValue="0.5" />
        </Field>
      </>
    );
  }

  if (active === "rewardRisk") {
    return (
      <>
        <Field label={labels.entryPrice}>
          <NumberInput name="entryPrice" defaultValue="65000" />
        </Field>
        <Field label={labels.stopLoss}>
          <NumberInput name="stopLoss" defaultValue="64000" />
        </Field>
        <Field label={labels.takeProfit}>
          <NumberInput name="takeProfit" defaultValue="67000" />
        </Field>
      </>
    );
  }

  return (
    <>
      <Field label={labels.entryPrice}>
        <NumberInput name="entryPrice" defaultValue="65000" />
      </Field>
      <Field label={labels.stopLoss}>
        <NumberInput name="stopLoss" defaultValue="64000" />
      </Field>
    </>
  );
}

function ResultGrid({ result, locale, labels, warnings }: { result: CalculatorResult; locale: Locale; labels: Record<string, string>; warnings: Record<string, string> }) {
  const entries = Object.entries(result).filter(([, value]) => value !== null && value !== undefined);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {entries
          .filter(([key]) => key !== "warning")
          .map(([key, value]) => (
            <StatCard key={key} label={labels[key] ?? formatLabel(key)} value={formatResultValue(key, value, locale)} compact />
          ))}
      </div>
      {result.warning ? <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm leading-6 text-warning">{warnings[String(result.warning)] ?? String(result.warning)}</p> : null}
    </div>
  );
}

function formatLabel(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function formatResultValue(key: string, value: unknown, locale: Locale) {
  if (typeof value !== "number") return String(value);
  const lower = key.toLowerCase();
  if (lower.includes("percent")) return formatPercent(value, locale);
  if (lower.includes("riskamount") || lower.includes("notional") || lower.includes("price") || lower.includes("distance")) {
    return formatMoney(value, locale);
  }
  // Quantities and ratios are numbers the page writes itself: Persian digits on the Persian page.
  return localizeDigits(Number.isInteger(value) ? String(value) : value.toFixed(4), locale);
}
