"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AuthRequiredState, LoadingState } from "@/components/ui/state";
import { apiFetch, isAuthError } from "@/lib/api/client";
import { apiErrorText } from "@/lib/api/error-text";
import { formatMoney, formatPercent } from "@/lib/i18n/format";
import { t, type getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";

type Messages = ReturnType<typeof getMessages>;
type Backtest = { id: string; name: string; market: string; timeframe: string; result: { netPnl: number; winRate: number; maxDrawdown: number } };

const copy = {
  en: {
    description:
      "Record the result of one scenario for a strategy: market, timeframe and outcome. Saved scenarios let you compare versions of a strategy. This page does not test against historical price data.",
    columns: { name: "Name", market: "Market", pnl: "Net P&L", win: "Win rate", drawdown: "Drawdown" },
    formTitle: "New scenario",
    name: "Name",
    market: "Market",
    markets: { crypto: "Crypto", forex: "Forex", stocks: "Global Stocks" } as Record<string, string>,
    timeframe: "Timeframe",
    startingBalance: "Starting balance",
    side: "Side",
    sides: { long: "Long", short: "Short" },
    entryPrice: "Entry price",
    exitPrice: "Exit price",
    quantity: "Quantity",
    fees: "Fees",
    run: "Save scenario",
    running: "Saving...",
    saveFailed: "The scenario could not be saved.",
    loadFailed: "Scenarios failed to load.",
    emptyTitle: "No scenarios saved yet",
    emptyDescription: "Save your first scenario with the form above, then compare the outcomes of different strategy versions here.",
    placeholders: { name: "e.g. Range fade, first month", timeframe: "1h", startingBalance: "25000", entryPrice: "100", exitPrice: "110", quantity: "10", fees: "0" }
  },
  fa: {
    description:
      "نتیجه یک سناریو را برای یک استراتژی ثبت کنید: بازار، تایم‌فریم و نتیجه. با سناریوهای ذخیره‌شده می‌توانید نسخه‌های مختلف استراتژی را با هم مقایسه کنید. این صفحه استراتژی را با داده‌های تاریخی قیمت آزمایش نمی‌کند.",
    columns: { name: "نام", market: "بازار", pnl: "سود و زیان خالص", win: "نرخ برد", drawdown: "افت سرمایه" },
    formTitle: "سناریوی جدید",
    name: "نام",
    market: "بازار",
    markets: { crypto: "کریپتو", forex: "فارکس", stocks: "سهام جهانی" } as Record<string, string>,
    timeframe: "تایم‌فریم",
    startingBalance: "موجودی اولیه",
    side: "سمت",
    sides: { long: "لانگ", short: "شورت" },
    entryPrice: "قیمت ورود",
    exitPrice: "قیمت خروج",
    quantity: "حجم",
    fees: "کارمزد",
    run: "ثبت سناریو",
    running: "در حال ذخیره...",
    saveFailed: "ذخیره سناریو ممکن نشد.",
    loadFailed: "بارگذاری سناریوها ممکن نشد.",
    emptyTitle: "هنوز سناریویی ثبت نشده",
    emptyDescription: "اولین سناریو را با فرم بالا ثبت کنید، بعد نتیجه نسخه‌های مختلف استراتژی را اینجا کنار هم ببینید.",
    placeholders: { name: "مثلاً بازگشت به میانه محدوده، ماه اول", timeframe: "1h", startingBalance: "25000", entryPrice: "100", exitPrice: "110", quantity: "10", fees: "0" }
  }
} as const;

export function BacktestScreen({ locale, messages }: { locale: Locale; messages: Messages }) {
  const c = copy[locale];
  const [backtests, setBacktests] = useState<Backtest[]>([]);
  // The empty state is only true once a load has worked: not while loading, and not after a failed load.
  const [listState, setListState] = useState<"loading" | "loaded" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const fieldLabels: Record<string, string> = {
    name: c.name,
    market: c.market,
    timeframe: c.timeframe,
    startingBalance: c.startingBalance,
    // The trade's own fields are nested, so the server reports them together under "trades".
    trades: [c.entryPrice, c.exitPrice, c.quantity, c.fees].join(locale === "fa" ? "، " : ", ")
  };

  async function load() {
    try {
      const data = await apiFetch<{ backtests: Backtest[] }>("/api/backtests");
      setBacktests(data.backtests);
      setListState("loaded");
      setError(null);
    } catch (err) {
      if (isAuthError(err)) setAuthRequired(true);
      else {
        setListState((state) => (state === "loaded" ? state : "failed"));
        setError(apiErrorText(err, locale, c.loadFailed));
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
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/api/backtests", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          market: form.get("market"),
          timeframe: form.get("timeframe"),
          startingBalance: form.get("startingBalance"),
          trades: [
            {
              side: form.get("side"),
              entryPrice: form.get("entryPrice"),
              exitPrice: form.get("exitPrice"),
              quantity: form.get("quantity"),
              fees: form.get("fees") || 0
            }
          ]
        })
      });
      formEl.reset();
      await load();
    } catch (err) {
      if (isAuthError(err)) setAuthRequired(true);
      else setError(apiErrorText(err, locale, c.saveFailed, fieldLabels));
    } finally {
      setSubmitting(false);
    }
  }

  if (authRequired) return <AuthRequiredState locale={locale} />;

  return (
    <div className="space-y-6">
      <PageHeader title={t(messages, "pages.backtests")} description={c.description} />
      {error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      <Card>
        <CardHeader><CardTitle>{c.formTitle}</CardTitle></CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-4" onSubmit={submit}>
            <Field label={`${c.name} *`}><Input name="name" placeholder={c.placeholders.name} required minLength={2} /></Field>
            <Field label={c.market}>
              <Select name="market" defaultValue="crypto"><option value="crypto">{c.markets.crypto}</option><option value="forex">{c.markets.forex}</option><option value="stocks">{c.markets.stocks}</option></Select>
            </Field>
            <Field label={`${c.timeframe} *`}><Input name="timeframe" placeholder={c.placeholders.timeframe} required /></Field>
            <Field label={`${c.startingBalance} *`}><Input name="startingBalance" placeholder={c.placeholders.startingBalance} inputMode="decimal" required /></Field>
            <Field label={c.side}>
              <Select name="side" defaultValue="long"><option value="long">{c.sides.long}</option><option value="short">{c.sides.short}</option></Select>
            </Field>
            <Field label={`${c.entryPrice} *`}><Input name="entryPrice" placeholder={c.placeholders.entryPrice} inputMode="decimal" required /></Field>
            <Field label={`${c.exitPrice} *`}><Input name="exitPrice" placeholder={c.placeholders.exitPrice} inputMode="decimal" required /></Field>
            <Field label={`${c.quantity} *`}><Input name="quantity" placeholder={c.placeholders.quantity} inputMode="decimal" required /></Field>
            <Field label={c.fees}><Input name="fees" placeholder={c.placeholders.fees} inputMode="decimal" /></Field>
            <Button className="md:col-span-4" disabled={submitting}>{submitting ? c.running : c.run}</Button>
          </form>
        </CardContent>
      </Card>
      {listState === "loading" ? <LoadingState locale={locale} /> : null}
      {listState === "loaded" ? (
        <DataTable
          rows={backtests}
          emptyTitle={c.emptyTitle}
          emptyDescription={c.emptyDescription}
          columns={[
            { key: "name", header: c.columns.name, cell: (row) => row.name },
            { key: "market", header: c.columns.market, cell: (row) => c.markets[row.market] ?? row.market },
            { key: "pnl", header: c.columns.pnl, cell: (row) => formatMoney(row.result.netPnl, locale) },
            { key: "win", header: c.columns.win, cell: (row) => formatPercent(row.result.winRate, locale) },
            { key: "dd", header: c.columns.drawdown, cell: (row) => formatPercent(row.result.maxDrawdown, locale) }
          ]}
        />
      ) : null}
    </div>
  );
}
