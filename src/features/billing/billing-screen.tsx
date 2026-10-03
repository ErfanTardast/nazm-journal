"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Copy } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SectionPanel } from "@/components/ui/section-panel";
import { Select } from "@/components/ui/select";
import { AuthRequiredState, ErrorState, LoadingState } from "@/components/ui/state";
import { apiFetch, isAuthError } from "@/lib/api/client";
import { normalizeTrackingCode } from "@/lib/billing/plans";
import { resolveEntitlements, UNLIMITED, type Tier } from "@/lib/entitlements";
import type { Locale } from "@/lib/i18n/locales";

type PaidTier = "pro" | "elite";
type Method = "card_to_card" | "usdt_trc20";
type Status = "pending" | "approved" | "rejected" | "refunded";

type PaymentView = {
  id: string;
  tier: PaidTier;
  amount: number;
  currency: "toman" | "usdt";
  method: Method;
  trackingCode: string;
  paidAt: string;
  status: Status;
  reviewNote: string | null;
};

type UsdtIntent = { id: string; tier: PaidTier; amount: number; expiresAt: string };

type Overview = {
  tier: Tier;
  tierExpiresAt: string | null;
  refundWindowDays: number;
  plans: Record<PaidTier, { priceToman: number; priceUsdt: number; periodDays: number }>;
  usdtIntent: UsdtIntent | null;
  methods: {
    card: { cardNumber: string; holder: string; bank?: string } | null;
    usdt: { address: string; network: "TRC20" } | null;
  };
  payments: PaymentView[];
};

const copy = {
  en: {
    title: "Plans and payment",
    description: "Upgrade by card-to-card transfer or USDT. Every transfer is checked by hand before the plan turns on.",
    current: "Current plan",
    until: "until",
    plans: "Plans",
    perPeriod: (days: number) => `for ${days} days`,
    free: "Free",
    howToPay: "How to pay",
    card: "Card-to-card",
    cardHolder: "Card holder",
    usdt: "USDT (TRC20)",
    trc20Warning: "Send USDT only on the TRC20 (Tron) network. Transfers on other networks cannot be recovered.",
    notOpen: "Purchases are not open yet. Please check back soon.",
    methodClosed: "not open yet",
    copyLabel: "Copy",
    form: "Report your transfer",
    formDesc: "After you transfer, enter the details so we can match it. Your plan turns on after review.",
    plan: "Plan",
    method: "Method",
    trackingCard: "Bank reference number (RRN, 12 digits)",
    trackingUsdt: "Transaction hash",
    paidAt: "Time of transfer",
    sendExactly: (amount: number) => `Send exactly ${amount} USDT on TRC20 so we can match your transfer to you.`,
    reserve: "Get my exact amount",
    reserving: "Reserving...",
    reserveFirst: "Get your exact USDT amount first, then send it and report the transaction hash.",
    reservedUntil: (date: string) => `Reserved for you until ${date}.`,
    exchangeFee: "If your exchange takes its fee from the amount, add the fee so this exact amount arrives.",
    transferToman: (amount: string) => `Transfer ${amount} to the card above.`,
    submit: "Submit for review",
    submitting: "Submitting...",
    submitted: "Submitted. We will review it and turn on your plan.",
    guarantee: (days: number) => `Your first paid plan has a ${days}-day money-back guarantee.`,
    terms: "Terms of Use",
    history: "Your transfers",
    none: "No transfers yet.",
    status: { pending: "Waiting for review", approved: "Approved", rejected: "Rejected", refunded: "Refunded" } as Record<Status, string>,
    limits: {
      plansLimit: "Active plans",
      strategies: "Playbooks",
      ai: "AI reviews per day",
      history: "History kept (days)",
      unlimited: "Unlimited",
      export: "Data export",
      analytics: "Advanced analytics",
      mentor: "Weekly mentor report"
    },
    loadError: "Could not load your plan",
    toman: "Toman"
  },
  fa: {
    title: "پلن‌ها و پرداخت",
    description: "با کارت‌به‌کارت یا USDT ارتقا دهید. هر واریز پیش از فعال شدن پلن دستی بررسی می‌شود.",
    current: "پلن فعلی",
    until: "تا",
    plans: "پلن‌ها",
    perPeriod: (days: number) => `برای ${days.toLocaleString("fa-IR")} روز`,
    free: "رایگان",
    howToPay: "روش پرداخت",
    card: "کارت‌به‌کارت",
    cardHolder: "به نام",
    usdt: "USDT (شبکه TRC20)",
    trc20Warning: "USDT را فقط روی شبکه TRC20 (ترون) بفرستید. واریز روی شبکه‌های دیگر قابل برگشت نیست.",
    notOpen: "خرید هنوز باز نشده است. لطفاً کمی بعد دوباره سر بزنید.",
    methodClosed: "هنوز باز نشده",
    copyLabel: "کپی",
    form: "ثبت واریز",
    formDesc: "بعد از واریز، مشخصات آن را وارد کنید تا تطبیق داده شود. پلن بعد از بررسی فعال می‌شود.",
    plan: "پلن",
    method: "روش",
    trackingCard: "شماره مرجع بانک (۱۲ رقم)",
    trackingUsdt: "هش تراکنش",
    paidAt: "زمان واریز",
    sendExactly: (amount: number) => `دقیقاً ${amount} USDT روی شبکه TRC20 بفرستید تا واریز شما شناسایی شود.`,
    reserve: "دریافت مبلغ دقیق من",
    reserving: "در حال رزرو...",
    reserveFirst: "اول مبلغ دقیق USDT خود را بگیرید، بعد همان را بفرستید و هش تراکنش را ثبت کنید.",
    reservedUntil: (date: string) => `این مبلغ تا ${date} برای شما رزرو است.`,
    exchangeFee: "اگر صرافی کارمزد را از مبلغ کم می‌کند، کارمزد را اضافه کنید تا دقیقاً همین مبلغ برسد.",
    transferToman: (amount: string) => `مبلغ ${amount} را به کارت بالا واریز کنید.`,
    submit: "ارسال برای بررسی",
    submitting: "در حال ارسال...",
    submitted: "ثبت شد. بعد از بررسی، پلن شما فعال می‌شود.",
    guarantee: (days: number) => `اولین پلن پولی شما ${days.toLocaleString("fa-IR")} روز ضمانت بازگشت وجه دارد.`,
    terms: "شرایط استفاده",
    history: "واریزهای شما",
    none: "هنوز واریزی ثبت نشده است.",
    status: { pending: "در انتظار بررسی", approved: "تأیید شد", rejected: "رد شد", refunded: "بازگشت داده شد" } as Record<Status, string>,
    limits: {
      plansLimit: "پلن‌های فعال",
      strategies: "پلی‌بوک‌ها",
      ai: "مرور AI در روز",
      history: "نگهداری سابقه (روز)",
      unlimited: "نامحدود",
      export: "خروجی داده",
      analytics: "تحلیل پیشرفته",
      mentor: "گزارش هفتگی منتور"
    },
    loadError: "بارگذاری پلن ممکن نشد",
    toman: "تومان"
  }
} as const;

const statusTone: Record<Status, "default" | "success" | "warning" | "danger"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  refunded: "default"
};

function formatAmount(locale: Locale, amount: number, currency: "toman" | "usdt") {
  if (currency === "usdt") return `${amount} USDT`;
  return `${amount.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")} ${copy[locale].toman}`;
}

function groupCard(cardNumber: string) {
  return cardNumber.replace(/(\d{4})(?=\d)/g, "$1 ");
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard can be unavailable (permissions, insecure context); the value stays selectable on screen.
  }
}

export function BillingScreen({ locale }: { locale: Locale }) {
  const c = copy[locale];
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [tier, setTier] = useState<PaidTier>("pro");
  const [method, setMethod] = useState<Method>("card_to_card");
  const [trackingCode, setTrackingCode] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [intent, setIntent] = useState<UsdtIntent | null>(null);
  const [reserving, setReserving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<Overview>("/api/billing");
      setOverview(data);
      setLoadError(null);
      return data;
    } catch (error) {
      setLoadError(error);
      return null;
    }
  }, []);

  // After a successful submit the page must not be replaced by an error card, or the user may pay twice.
  const refresh = useCallback(async () => {
    try {
      setOverview(await apiFetch<Overview>("/api/billing"));
    } catch {
      // Keep the current view and the confirmation; the list catches up on the next visit.
    }
  }, []);

  useEffect(() => {
    void load().then((data) => {
      if (!data) return;
      if (data.usdtIntent) {
        setIntent(data.usdtIntent);
        setTier(data.usdtIntent.tier);
        setMethod("usdt_trc20");
      } else if (!data.methods.card && data.methods.usdt) {
        setMethod("usdt_trc20");
      }
    });
  }, [load]);

  if (loadError) {
    return isAuthError(loadError) ? <AuthRequiredState locale={locale} /> : <ErrorState title={c.loadError} description={String(loadError)} />;
  }
  if (!overview) return <LoadingState />;

  const open = { card_to_card: Boolean(overview.methods.card), usdt_trc20: Boolean(overview.methods.usdt) };
  const anyOpen = open.card_to_card || open.usdt_trc20;
  const liveIntent = intent && intent.tier === tier ? intent : null;
  const needsReservation = method === "usdt_trc20" && !liveIntent;

  async function reserve() {
    setReserving(true);
    setMessage(null);
    try {
      setIntent(await apiFetch<UsdtIntent>("/api/billing/usdt-intents", { method: "POST", body: JSON.stringify({ tier }) }));
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setReserving(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      await apiFetch("/api/billing/payments", {
        method: "POST",
        body: JSON.stringify({
          tier,
          method,
          trackingCode: normalizeTrackingCode(method, trackingCode),
          paidAt: new Date(paidAt).toISOString(),
          ...(method === "usdt_trc20" && liveIntent ? { intentId: liveIntent.id } : {})
        })
      });
      if (method === "usdt_trc20") setIntent(null);
      setTrackingCode("");
      setPaidAt("");
      setMessage({ tone: "success", text: c.submitted });
      await refresh();
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setSubmitting(false);
    }
  }

  const tierLabel = (value: Tier) => (value === "free" ? c.free : value === "pro" ? "Pro" : "Elite");
  const limitText = (value: number) => (value === UNLIMITED ? c.limits.unlimited : value.toLocaleString(locale === "fa" ? "fa-IR" : "en-US"));

  return (
    <div className="space-y-6">
      <PageHeader title={c.title} description={c.description} />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{c.current}:</span>
        <Badge tone={overview.tier === "free" ? "default" : "success"}>{tierLabel(overview.tier)}</Badge>
        {overview.tierExpiresAt && overview.tier !== "free" ? (
          <span className="text-muted-foreground">
            {c.until} {new Date(overview.tierExpiresAt).toLocaleDateString(locale === "fa" ? "fa-IR" : "en-US")}
          </span>
        ) : null}
      </div>

      <SectionPanel title={c.plans}>
        <div className="grid gap-4 md:grid-cols-3">
          {(["free", "pro", "elite"] as const).map((planTier) => {
            const ent = resolveEntitlements(planTier);
            const plan = planTier === "free" ? null : overview.plans[planTier];
            return (
              <div key={planTier} className="space-y-3 rounded-md border border-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-foreground">{tierLabel(planTier)}</p>
                  {overview.tier === planTier ? <Badge tone="success">{c.current}</Badge> : null}
                </div>
                {plan ? (
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold text-foreground">{formatAmount(locale, plan.priceToman, "toman")}</p>
                    <p className="text-muted-foreground">{formatAmount(locale, plan.priceUsdt, "usdt")}</p>
                    <p className="text-xs text-muted-foreground">{c.perPeriod(plan.periodDays)}</p>
                  </div>
                ) : null}
                <ul className="space-y-1 text-xs leading-5 text-muted-foreground">
                  <li>{c.limits.plansLimit}: {limitText(ent.limits.maxActivePlans)}</li>
                  <li>{c.limits.strategies}: {limitText(ent.limits.maxStrategies)}</li>
                  <li>{c.limits.ai}: {limitText(ent.limits.aiReviewsPerDay)}</li>
                  <li>{c.limits.history}: {limitText(ent.limits.historyRetentionDays)}</li>
                  {ent.features.dataExport ? <li>{c.limits.export}</li> : null}
                  {ent.features.advancedAnalytics ? <li>{c.limits.analytics}</li> : null}
                  {ent.features.weeklyMentorReport ? <li>{c.limits.mentor}</li> : null}
                </ul>
              </div>
            );
          })}
        </div>
      </SectionPanel>

      <SectionPanel title={c.howToPay}>
        {anyOpen ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-md border border-border p-4 text-sm">
              <p className="font-semibold text-foreground">{c.card}</p>
              {overview.methods.card ? (
                <>
                  <div className="flex items-center gap-2">
                    <span dir="ltr" className="font-mono text-base text-foreground">{groupCard(overview.methods.card.cardNumber)}</span>
                    <Button type="button" variant="ghost" aria-label={c.copyLabel} onClick={() => copyText(overview.methods.card!.cardNumber)}>
                      <Copy className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                  <p className="text-muted-foreground">
                    {c.cardHolder}: {overview.methods.card.holder}
                    {overview.methods.card.bank ? ` (${overview.methods.card.bank})` : ""}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">{c.methodClosed}</p>
              )}
            </div>
            <div className="space-y-2 rounded-md border border-border p-4 text-sm">
              <p className="font-semibold text-foreground">{c.usdt}</p>
              {overview.methods.usdt ? (
                <>
                  <div className="flex items-center gap-2">
                    <span dir="ltr" className="break-all font-mono text-foreground">{overview.methods.usdt.address}</span>
                    <Button type="button" variant="ghost" aria-label={c.copyLabel} onClick={() => copyText(overview.methods.usdt!.address)}>
                      <Copy className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                  <p className="rounded-md border border-warning/30 bg-warning/10 p-2 text-foreground">{c.trc20Warning}</p>
                  {intent ? (
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">{c.sendExactly(intent.amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.reservedUntil(new Date(intent.expiresAt).toLocaleString(locale === "fa" ? "fa-IR" : "en-US"))} {c.exchangeFee}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">{c.reserveFirst}</p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">{c.methodClosed}</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{c.notOpen}</p>
        )}
      </SectionPanel>

      <SectionPanel title={c.form} description={c.formDesc}>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
          <Field label={c.plan}>
            <Select aria-label={c.plan} value={tier} onChange={(event) => setTier(event.target.value as PaidTier)}>
              <option value="pro">Pro</option>
              <option value="elite">Elite</option>
            </Select>
          </Field>
          <Field label={c.method}>
            <Select aria-label={c.method} value={method} onChange={(event) => setMethod(event.target.value as Method)}>
              <option value="card_to_card" disabled={!open.card_to_card}>{c.card}</option>
              <option value="usdt_trc20" disabled={!open.usdt_trc20}>{c.usdt}</option>
            </Select>
          </Field>
          <Field label={method === "usdt_trc20" ? c.trackingUsdt : c.trackingCard}>
            <Input
              aria-label={method === "usdt_trc20" ? c.trackingUsdt : c.trackingCard}
              dir="ltr"
              value={trackingCode}
              onChange={(event) => setTrackingCode(event.target.value)}
              required
            />
          </Field>
          <Field label={c.paidAt}>
            <Input aria-label={c.paidAt} type="datetime-local" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} required />
          </Field>
          <div className="space-y-2 md:col-span-2">
            {anyOpen && method === "card_to_card" ? (
              <p className="text-sm font-semibold text-foreground">
                {c.transferToman(formatAmount(locale, overview.plans[tier].priceToman, "toman"))}
              </p>
            ) : null}
            {anyOpen && method === "usdt_trc20" ? (
              liveIntent ? (
                <p className="text-sm font-semibold text-foreground">{c.sendExactly(liveIntent.amount)}</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="secondary" onClick={reserve} disabled={reserving}>
                    {reserving ? c.reserving : c.reserve}
                  </Button>
                  <span className="text-xs text-muted-foreground">{c.reserveFirst}</span>
                </div>
              )
            ) : null}
            <p className="text-xs text-muted-foreground">
              {c.guarantee(overview.refundWindowDays)}{" "}
              <Link href={`/${locale}/terms`} className="font-semibold text-primary hover:underline">
                {c.terms}
              </Link>
            </p>
            {message ? (
              <p className={message.tone === "success" ? "text-sm text-success" : "text-sm text-destructive"}>{message.text}</p>
            ) : null}
            <Button type="submit" disabled={!anyOpen || submitting || needsReservation}>
              {submitting ? c.submitting : c.submit}
            </Button>
          </div>
        </form>
      </SectionPanel>

      <SectionPanel title={c.history}>
        {overview.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{c.none}</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {overview.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-foreground">
                  {tierLabel(p.tier)} · {formatAmount(locale, p.amount, p.currency)}
                </span>
                <span dir="ltr" className="break-all font-mono text-xs text-muted-foreground">{p.trackingCode}</span>
                <span className="flex items-center gap-2">
                  <Badge tone={statusTone[p.status]}>{c.status[p.status]}</Badge>
                  {p.reviewNote ? <span className="text-xs text-muted-foreground">{p.reviewNote}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionPanel>
    </div>
  );
}
