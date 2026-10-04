"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Layers } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SectionPanel } from "@/components/ui/section-panel";
import { Select } from "@/components/ui/select";
import { planPosition, SYMBOL_PRESETS, specFromPreset, type Direction, type PlanError, type SymbolSpec } from "@/lib/calculations/position-plan";
import { formatMoney } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";
import { formatGeneratedNumber, localizeDigits } from "@/lib/services/locale";
import { parseNumberInput } from "@/lib/validation/number-input";
import { SPEC_FIELDS, type PlannerPrefill, type PlannerSnapshot } from "./plan-sizing";

const copy = {
  en: {
    title: "Position size planner",
    description:
      "Sizes a trade from your risk % and splits it into legs with a take-profit ladder, using your broker's lot rules. The volume is rounded down to the lot step and checked against the minimum and maximum lot.",
    symbol: "Symbol",
    custom: "Custom (enter your broker's spec)",
    direction: "Direction",
    buy: "Buy",
    sell: "Sell",
    balance: "Account balance",
    risk: "Risk %",
    entry: "Entry",
    stopLoss: "Stop loss",
    finalTp: "Final take profit",
    positions: "Number of positions",
    commission: "Commission per lot",
    slippage: "Slippage (points)",
    digits: "Price digits",
    tickSize: "Tick size",
    tickValue: "Tick value (per lot)",
    volumeMin: "Minimum lot",
    volumeMax: "Maximum lot",
    volumeStep: "Lot step",
    total: "Total volume",
    lots: (value: string) => `${value} lots`,
    budget: "Risk budget",
    slLoss: "Loss at stop for this plan",
    finalR: "Final R",
    lossPerLot: "Loss per lot at stop",
    leg: "Leg",
    volume: "Lots",
    takeProfit: "Take profit",
    rr: "R",
    presetNote: "Presets are typical MT5 specs for a USD account. Check Symbol > Specification in your terminal; brokers differ.",
    planningOnly: "Planning only: Nazm never places orders.",
    errors: {
      invalid_number: "Enter valid numbers for every field.",
      invalid_prices: "Prices must be positive.",
      buy_geometry: "BUY needs Stop Loss < Entry < Final TP.",
      sell_geometry: "SELL needs Final TP < Entry < Stop Loss.",
      positions: "Number of positions must be a whole number from 1.",
      tp_invalid: "The take-profit levels do not fit this symbol's tick size. Widen the Final TP or use fewer positions.",
      tp_collapse: "The take-profit levels collapse onto the same tick. Widen the Final TP or use fewer positions.",
      spec_invalid: "Enter a valid symbol specification (tick size, tick value and lot rules).",
      risk_invalid: "Balance and risk % must be positive, with risk at most 100%.",
      loss_invalid: "The loss per lot at the stop is zero. Check the stop and the tick value.",
      slippage_past_stop: "The assumed slippage moves the entry past the stop loss.",
      volume_below_min: "The risk-sized volume is below the broker minimum for this many positions. Use fewer positions or a wider risk budget.",
      leg_below_min: "A leg falls below the broker minimum lot. Use fewer positions.",
      leg_above_max: "A leg exceeds the broker maximum lot. Use more positions."
    } as Record<PlanError["code"], string>
  },
  fa: {
    title: "برنامه‌ریز حجم پوزیشن",
    description:
      "حجم معامله را از درصد ریسک شما حساب می‌کند و آن را با پلکان حد سود به چند بخش تقسیم می‌کند، با قوانین حجم کارگزار شما. حجم به گام لات رو به پایین گرد می‌شود و با حداقل و حداکثر لات بررسی می‌شود.",
    symbol: "نماد",
    custom: "دستی (مشخصات کارگزار خودتان)",
    direction: "جهت",
    buy: "خرید",
    sell: "فروش",
    balance: "موجودی حساب",
    risk: "درصد ریسک",
    entry: "ورود",
    stopLoss: "حد ضرر",
    finalTp: "حد سود نهایی",
    positions: "تعداد پوزیشن",
    commission: "کمیسیون هر لات",
    slippage: "لغزش قیمت (پوینت)",
    digits: "تعداد رقم اعشار قیمت",
    tickSize: "اندازه تیک",
    tickValue: "ارزش تیک (هر لات)",
    volumeMin: "حداقل لات",
    volumeMax: "حداکثر لات",
    volumeStep: "گام لات",
    total: "حجم کل",
    lots: (value: string) => `${value} لات`,
    budget: "بودجه ریسک",
    slLoss: "زیان در حد ضرر برای این پلن",
    finalR: "R نهایی",
    lossPerLot: "زیان هر لات در حد ضرر",
    leg: "بخش",
    volume: "لات",
    takeProfit: "حد سود",
    rr: "R",
    presetNote: "پیش‌فرض‌ها مشخصات رایج MT5 برای حساب دلاری‌اند. در ترمینال خود Symbol > Specification را چک کنید؛ کارگزارها فرق دارند.",
    planningOnly: "فقط برای برنامه‌ریزی: اپ نظم هرگز سفارشی ثبت نمی‌کند.",
    errors: {
      invalid_number: "برای همه فیلدها عدد معتبر وارد کنید.",
      invalid_prices: "قیمت‌ها باید مثبت باشند.",
      buy_geometry: "برای خرید: حد ضرر < ورود < حد سود نهایی.",
      sell_geometry: "برای فروش: حد سود نهایی < ورود < حد ضرر.",
      positions: "تعداد پوزیشن باید عدد صحیح از ۱ به بالا باشد.",
      tp_invalid: "پله‌های حد سود با اندازه تیک این نماد جور نیستند. حد سود نهایی را دورتر کنید یا پوزیشن کمتری بگذارید.",
      tp_collapse: "پله‌های حد سود روی یک تیک می‌افتند. حد سود نهایی را دورتر کنید یا پوزیشن کمتری بگذارید.",
      spec_invalid: "مشخصات معتبر نماد را وارد کنید (اندازه و ارزش تیک و قوانین لات).",
      risk_invalid: "موجودی و درصد ریسک باید مثبت باشند و ریسک حداکثر ۱۰۰٪.",
      loss_invalid: "زیان هر لات در حد ضرر صفر است. حد ضرر و ارزش تیک را چک کنید.",
      slippage_past_stop: "لغزش فرض‌شده ورود را از حد ضرر رد می‌کند.",
      volume_below_min: "حجم محاسبه‌شده برای این تعداد پوزیشن کمتر از حداقل کارگزار است. پوزیشن کمتر یا بودجه ریسک بیشتری بگذارید.",
      leg_below_min: "یکی از بخش‌ها کمتر از حداقل لات کارگزار است. پوزیشن کمتری بگذارید.",
      leg_above_max: "یکی از بخش‌ها بیشتر از حداکثر لات کارگزار است. پوزیشن بیشتری بگذارید."
    } as Record<PlanError["code"], string>
  }
} as const;

type Form = Record<
  | "balance"
  | "risk"
  | "entry"
  | "stopLoss"
  | "finalTp"
  | "positions"
  | "commission"
  | "slippage"
  | "digits"
  | "tickSize"
  | "tickValue"
  | "volumeMin"
  | "volumeMax"
  | "volumeStep",
  string
>;

const DEFAULTS: Form = {
  balance: "10000",
  risk: "1",
  entry: "1.10000",
  stopLoss: "1.09800",
  finalTp: "1.10600",
  positions: "3",
  commission: "0",
  slippage: "0",
  digits: "5",
  tickSize: "0.00001",
  tickValue: "1",
  volumeMin: "0.01",
  volumeMax: "100",
  volumeStep: "0.01"
};

const num = (value: string) => (value.trim() === "" ? NaN : parseNumberInput(value));

/**
 * The fields a plan can fill; a field the plan gives as "" starts empty (an example number would be made up). That
 * includes the contract spec of a symbol the desk has no preset for: the planner then asks for it instead of sizing on
 * the EURUSD example.
 */
const PREFILLED_FIELDS = ["balance", "risk", "entry", "stopLoss", "finalTp", "positions", ...SPEC_FIELDS] as const;

/** A sentence under a field that explains where its starting value came from; it goes away once the value is changed. */
export type PlannerHints = Partial<Record<"symbol" | "direction" | "balance" | "risk" | "entry", string>>;

export function PositionPlanner({
  locale,
  prefill,
  hints,
  footer
}: {
  locale: Locale;
  /** Starting values (from a plan). Without it the planner starts from its own example. */
  prefill?: PlannerPrefill | null;
  hints?: PlannerHints;
  /** Extra content under the result, given what the planner has worked out right now. */
  footer?: (snapshot: PlannerSnapshot) => ReactNode;
}) {
  const c = copy[locale];
  const [symbol, setSymbol] = useState<string>(prefill?.symbol ?? "EURUSD");
  const [direction, setDirection] = useState<Direction>(prefill?.direction ?? "buy");
  const [form, setForm] = useState<Form>(() => {
    const start = { ...DEFAULTS };
    for (const key of PREFILLED_FIELDS) start[key] = prefill?.[key] ?? DEFAULTS[key];
    return start;
  });
  const balanceTouched = useRef(false);
  const set = (key: keyof Form) => (event: { target: { value: string } }) => {
    if (key === "balance") balanceTouched.current = true;
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
  };

  // The account's balance can arrive after the planner is on screen: it fills the field only if nobody has typed there.
  const lateBalance = prefill?.balance;
  useEffect(() => {
    if (balanceTouched.current || !lateBalance) return;
    setForm((prev) => (prev.balance === lateBalance ? prev : { ...prev, balance: lateBalance }));
  }, [lateBalance]);

  const spec: SymbolSpec = useMemo(
    () =>
      symbol === "custom"
        ? {
            digits: num(form.digits),
            tickSize: num(form.tickSize),
            tickValue: num(form.tickValue),
            volumeMin: num(form.volumeMin),
            volumeMax: num(form.volumeMax),
            volumeStep: num(form.volumeStep)
          }
        : specFromPreset(symbol, num(form.entry)),
    [symbol, form]
  );

  const result = useMemo(
    () =>
      planPosition({
        direction,
        balance: num(form.balance),
        riskPercent: num(form.risk),
        entry: num(form.entry),
        stopLoss: num(form.stopLoss),
        finalTp: num(form.finalTp),
        positions: num(form.positions),
        spec,
        commissionPerLot: num(form.commission || "0"),
        slippagePoints: num(form.slippage || "0")
      }),
    [direction, form, spec]
  );

  const digits = Number.isInteger(spec.digits) && spec.digits >= 0 && spec.digits <= 10 ? spec.digits : 5;
  const lotDigits = Math.max(0, Math.min(8, (String(spec.volumeStep).split(".")[1] ?? "").length));
  // A hint explains the value a plan filled in, so it stays only while the field still holds that value.
  const hintFor = (key: keyof PlannerHints) => {
    const text = hints?.[key];
    if (!text || !prefill) return undefined;
    const unchanged = key === "symbol" ? symbol === prefill.symbol : key === "direction" ? direction === prefill.direction : form[key] === prefill[key];
    return unchanged ? text : undefined;
  };
  const input = (key: keyof Form, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <Input aria-label={label} dir="ltr" inputMode="decimal" value={form[key]} onChange={set(key)} />
    </Field>
  );
  // Numbers the page writes itself take the digits of the language; prices and lots stay as typed (left to right).
  const decimals = (value: number) => formatGeneratedNumber(value, 2, locale);
  const percentSign = locale === "fa" ? "٪" : "%";
  const snapshot: PlannerSnapshot = {
    symbol,
    direction,
    balance: num(form.balance),
    riskPercent: num(form.risk),
    entry: num(form.entry),
    stopLoss: num(form.stopLoss),
    finalTp: num(form.finalTp),
    positions: num(form.positions),
    lotDigits,
    result
  };

  return (
    <SectionPanel title={c.title} description={c.description}>
      <div className="grid gap-4 md:grid-cols-4">
        <Field label={c.symbol} hint={hintFor("symbol")}>
          <Select aria-label={c.symbol} value={symbol} onChange={(event) => setSymbol(event.target.value)}>
            {Object.keys(SYMBOL_PRESETS).map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
            <option value="custom">{c.custom}</option>
          </Select>
        </Field>
        <Field label={c.direction} hint={hintFor("direction")}>
          <Select aria-label={c.direction} value={direction} onChange={(event) => setDirection(event.target.value as Direction)}>
            <option value="buy">{c.buy}</option>
            <option value="sell">{c.sell}</option>
          </Select>
        </Field>
        {input("balance", c.balance, hintFor("balance"))}
        {input("risk", c.risk, hintFor("risk"))}
        {input("entry", c.entry, hintFor("entry"))}
        {input("stopLoss", c.stopLoss)}
        {input("finalTp", c.finalTp)}
        {input("positions", c.positions)}
        {input("commission", c.commission)}
        {input("slippage", c.slippage)}
        {symbol === "custom" ? (
          <>
            {input("digits", c.digits)}
            {input("tickSize", c.tickSize)}
            {input("tickValue", c.tickValue)}
            {input("volumeMin", c.volumeMin)}
            {input("volumeMax", c.volumeMax)}
            {input("volumeStep", c.volumeStep)}
          </>
        ) : null}
      </div>
      {symbol === "custom" ? null : <p className="mt-3 text-xs text-muted-foreground">{c.presetNote}</p>}

      <div className="mt-5">
        {result.ok ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                [c.total, c.lots(result.plan.totalVolume.toFixed(lotDigits))],
                [c.budget, formatMoney(result.plan.riskMoney, locale)],
                [c.slLoss, `${formatMoney(result.plan.allocatedSlLoss, locale)} (${decimals(result.plan.allocatedRiskPercent)}${percentSign})`],
                [c.finalR, `${decimals(result.plan.finalRr)}R`],
                [c.lossPerLot, formatMoney(result.plan.lossPerLot, locale)]
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p dir="ltr" className="mt-1 text-sm font-semibold text-foreground">
                    {value}
                  </p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="p-2 text-start font-medium">{c.leg}</th>
                    <th className="p-2 text-start font-medium">{c.volume}</th>
                    <th className="p-2 text-start font-medium">{c.takeProfit}</th>
                    <th className="p-2 text-start font-medium">{c.rr}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.plan.legs.map((leg, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="p-2">{localizeDigits(String(i + 1), locale)}</td>
                      <td className="p-2" dir="ltr">{leg.volume.toFixed(lotDigits)}</td>
                      <td className="p-2" dir="ltr">{leg.takeProfit.toFixed(digits)}</td>
                      <td className="p-2" dir="ltr">{decimals(leg.rr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">{c.errors[result.code]}</p>
        )}
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Layers className="size-4" aria-hidden="true" />
          {c.planningOnly}
        </p>
      </div>
      {footer ? <div className="mt-5 space-y-4 border-t border-border pt-5">{footer(snapshot)}</div> : null}
    </SectionPanel>
  );
}
