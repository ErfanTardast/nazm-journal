"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { AuthRequiredState, ErrorState, LoadingState } from "@/components/ui/state";
import { apiFetch, isAuthError } from "@/lib/api/client";
import { apiErrorText } from "@/lib/api/error-text";
import { formatMoney } from "@/lib/i18n/format";
import { t, type getMessages } from "@/lib/i18n/messages";
import { localDateTimeToIso, toLocalDateTimeValue } from "@/lib/time/local-datetime";
import type { Locale } from "@/lib/i18n/locales";

type Messages = ReturnType<typeof getMessages>;
type Portfolio = {
  id: string;
  name: string;
  cashBalance: number;
  baseCurrency: string;
  holdings: { id: string; quantity: number; averageEntry: number; realizedPnl: number; asset: { symbol: string } }[];
};

const copy = {
  en: {
    description: "Track account context, holdings, imported/manual transactions, average entry, and realized performance for review.",
    loading: "Loading portfolio",
    unavailable: "Portfolio unavailable",
    loadFailed: "Portfolio failed to load.",
    stats: { portfolios: "Portfolios", cash: "Cash", realized: "Realized P&L" },
    columns: { portfolio: "Portfolio", symbol: "Symbol", quantity: "Quantity", average: "Average entry", realized: "Realized P&L" },
    createTitle: "Create Portfolio",
    name: "Name",
    baseCurrency: "Base currency",
    cashBalance: "Cash balance",
    create: "Create",
    addTitle: "Add Transaction",
    symbol: "Symbol",
    market: "Market",
    markets: { crypto: "Crypto", forex: "Forex", stocks: "Global Stocks" },
    side: "Direction",
    sides: { long: "Increase exposure", short: "Reduce exposure" },
    quantity: "Quantity",
    price: "Price",
    fees: "Fees",
    executedAt: "Executed at",
    addToFirst: "Add to first portfolio",
    saving: "Saving...",
    portfolioFailed: "The portfolio could not be saved.",
    transactionFailed: "The transaction could not be saved.",
    emptyTitle: "No holdings yet",
    emptyDescription: "Holdings appear here once you add a transaction to a portfolio. Create a portfolio with the form above, then add your first transaction.",
    placeholders: { name: "e.g. Main account", baseCurrency: "USD", cashBalance: "0", symbol: "BTCUSDT", quantity: "0.05", price: "65000", fees: "0" }
  },
  fa: {
    description: "زمینه حساب، دارایی‌ها، تراکنش‌های واردشده یا دستی، میانگین ورود و عملکرد تحقق‌یافته را برای مرور دنبال کنید.",
    loading: "در حال بارگذاری پورتفوی",
    unavailable: "پورتفوی در دسترس نیست",
    loadFailed: "بارگذاری پورتفوی ممکن نشد.",
    stats: { portfolios: "پورتفوها", cash: "موجودی نقد", realized: "سود و زیان تحقق‌یافته" },
    columns: { portfolio: "پورتفوی", symbol: "نماد", quantity: "حجم", average: "میانگین ورود", realized: "سود و زیان تحقق‌یافته" },
    createTitle: "ساخت پورتفوی",
    name: "نام",
    baseCurrency: "ارز پایه",
    cashBalance: "موجودی نقد",
    create: "ساخت",
    addTitle: "افزودن تراکنش",
    symbol: "نماد",
    market: "بازار",
    markets: { crypto: "کریپتو", forex: "فارکس", stocks: "سهام جهانی" },
    side: "جهت",
    sides: { long: "افزایش موقعیت (خرید)", short: "کاهش موقعیت (فروش)" },
    quantity: "حجم",
    price: "قیمت",
    fees: "کارمزد",
    executedAt: "زمان اجرا",
    addToFirst: "افزودن به پورتفوی اول",
    saving: "در حال ذخیره...",
    portfolioFailed: "ذخیره پورتفوی ممکن نشد.",
    transactionFailed: "ذخیره تراکنش ممکن نشد.",
    emptyTitle: "هنوز دارایی‌ای نیست",
    emptyDescription: "دارایی‌ها بعد از ثبت اولین تراکنش در یک پورتفوی اینجا نمایش داده می‌شوند. ابتدا با فرم بالا پورتفوی بسازید، بعد اولین تراکنش را اضافه کنید.",
    placeholders: { name: "مثلاً حساب اصلی", baseCurrency: "USD", cashBalance: "0", symbol: "BTCUSDT", quantity: "0.05", price: "65000", fees: "0" }
  }
} as const;

export function PortfolioScreen({ locale, messages }: { locale: Locale; messages: Messages }) {
  const c = copy[locale];
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const fieldLabels: Record<string, string> = {
    name: c.name,
    baseCurrency: c.baseCurrency,
    cashBalance: c.cashBalance,
    symbol: c.symbol,
    market: c.market,
    side: c.side,
    quantity: c.quantity,
    price: c.price,
    fees: c.fees,
    executedAt: c.executedAt
  };

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<{ portfolios: Portfolio[] }>("/api/portfolios");
      setPortfolios(data.portfolios);
      setError(null);
    } catch (err) {
      if (isAuthError(err)) setAuthRequired(true);
      else setError(apiErrorText(err, locale, c.loadFailed));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createPortfolio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // React clears event.currentTarget once the handler returns its promise, so take the form before awaiting.
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setSubmitting(true);
    setFormError(null);
    try {
      // Blank currency and cash fall back to the server defaults (USD, 0) instead of failing validation.
      const baseCurrency = String(form.get("baseCurrency") ?? "").trim();
      const cashBalance = String(form.get("cashBalance") ?? "").trim();
      await apiFetch("/api/portfolios", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          ...(baseCurrency ? { baseCurrency } : {}),
          ...(cashBalance ? { cashBalance } : {})
        })
      });
      formEl.reset();
      await load();
    } catch (err) {
      if (isAuthError(err)) setAuthRequired(true);
      else setFormError(apiErrorText(err, locale, c.portfolioFailed, fieldLabels));
    } finally {
      setSubmitting(false);
    }
  }

  async function addTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!portfolios[0]) return;
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setSubmitting(true);
    setFormError(null);
    try {
      await apiFetch(`/api/portfolios/${portfolios[0].id}/transactions`, {
        method: "POST",
        body: JSON.stringify({
          ...Object.fromEntries(form),
          fees: form.get("fees") || 0,
          executedAt: localDateTimeToIso(form.get("executedAt"))
        })
      });
      formEl.reset();
      await load();
    } catch (err) {
      if (isAuthError(err)) setAuthRequired(true);
      else setFormError(apiErrorText(err, locale, c.transactionFailed, fieldLabels));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState label={c.loading} />;
  if (authRequired) return <AuthRequiredState locale={locale} />;
  if (error) return <ErrorState title={c.unavailable} description={error} />;

  const cash = portfolios.reduce((sum, portfolio) => sum + portfolio.cashBalance, 0);
  const realized = portfolios.reduce((sum, portfolio) => sum + portfolio.holdings.reduce((total, holding) => total + holding.realizedPnl, 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title={t(messages, "pages.portfolio")} description={c.description} />
      {formError ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{formError}</p> : null}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label={c.stats.portfolios} value={String(portfolios.length)} />
        <StatCard label={c.stats.cash} value={formatMoney(cash, locale)} />
        <StatCard label={c.stats.realized} value={formatMoney(realized, locale)} tone={realized >= 0 ? "success" : "danger"} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{c.createTitle}</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={createPortfolio}>
              <Field label={`${c.name} *`}><Input name="name" placeholder={c.placeholders.name} required minLength={2} /></Field>
              <Field label={c.baseCurrency}><Input name="baseCurrency" placeholder={c.placeholders.baseCurrency} minLength={3} maxLength={6} /></Field>
              <Field label={c.cashBalance}><Input name="cashBalance" placeholder={c.placeholders.cashBalance} inputMode="decimal" /></Field>
              <Button disabled={submitting}>{submitting ? c.saving : c.create}</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{c.addTitle}</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-2" onSubmit={addTransaction}>
              <Field label={`${c.symbol} *`}><Input name="symbol" placeholder={c.placeholders.symbol} required /></Field>
              <Field label={c.market}>
                <Select name="market" defaultValue="crypto"><option value="crypto">{c.markets.crypto}</option><option value="forex">{c.markets.forex}</option><option value="stocks">{c.markets.stocks}</option></Select>
              </Field>
              <Field label={c.side}>
                <Select name="side" defaultValue="long"><option value="long">{c.sides.long}</option><option value="short">{c.sides.short}</option></Select>
              </Field>
              <Field label={`${c.quantity} *`}><Input name="quantity" placeholder={c.placeholders.quantity} inputMode="decimal" required /></Field>
              <Field label={`${c.price} *`}><Input name="price" placeholder={c.placeholders.price} inputMode="decimal" required /></Field>
              <Field label={c.fees}><Input name="fees" placeholder={c.placeholders.fees} inputMode="decimal" /></Field>
              <Field label={`${c.executedAt} *`}><Input name="executedAt" type="datetime-local" defaultValue={toLocalDateTimeValue(new Date())} required /></Field>
              <Button disabled={!portfolios[0] || submitting}>{submitting ? c.saving : c.addToFirst}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <DataTable
        rows={portfolios.flatMap((portfolio) => portfolio.holdings.map((holding) => ({ ...holding, portfolio: portfolio.name })))}
        emptyTitle={c.emptyTitle}
        emptyDescription={c.emptyDescription}
        columns={[
          { key: "portfolio", header: c.columns.portfolio, cell: (row) => row.portfolio },
          { key: "symbol", header: c.columns.symbol, cell: (row) => row.asset.symbol },
          { key: "quantity", header: c.columns.quantity, cell: (row) => row.quantity },
          { key: "average", header: c.columns.average, cell: (row) => row.averageEntry },
          { key: "realized", header: c.columns.realized, cell: (row) => formatMoney(row.realizedPnl, locale) }
        ]}
      />
    </div>
  );
}
