"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AuthRequiredState, LoadingState } from "@/components/ui/state";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, isAuthError } from "@/lib/api/client";
import { apiErrorText } from "@/lib/api/error-text";
import { t, type getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";
import { parseNumberInput } from "@/lib/validation/number-input";

type Messages = ReturnType<typeof getMessages>;
type Alert = { id: string; type: string; status: string; symbol: string | null; message: string };

const copy = {
  en: {
    description: "Create price, risk, and review reminders for disciplined trading workflows.",
    formTitle: "Create Alert",
    type: "Type",
    types: {
      price: "Price",
      indicator: "Indicator",
      risk: "Risk",
      journal_reminder: "Journal reminder",
      daily_review: "Daily review",
      weekly_review: "Weekly review"
    } as Record<string, string>,
    statuses: { active: "Active", triggered: "Triggered", paused: "Paused", archived: "Archived" } as Record<string, string>,
    columns: { type: "Type", symbol: "Symbol", status: "Status", message: "Message" },
    symbol: "Symbol",
    operator: "Condition",
    price: "Price level",
    message: "Message",
    create: "Create alert",
    saving: "Saving...",
    saveFailed: "The alert could not be saved.",
    invalidPrice: "Enter the price level as a number, for example 65000.",
    loadFailed: "Alerts failed to load.",
    emptyTitle: "No alerts yet",
    emptyDescription: "An alert reminds you of a price level, a risk limit or your daily review. Create your first one with the form above.",
    placeholders: { symbol: "BTCUSDT", price: "65000", message: "e.g. Price reached the level to review." }
  },
  fa: {
    description: "برای یک روال معاملاتی منظم، یادآورهای قیمت، ریسک و مرور بسازید.",
    formTitle: "ساخت هشدار",
    type: "نوع",
    types: {
      price: "قیمت",
      indicator: "اندیکاتور",
      risk: "ریسک",
      journal_reminder: "یادآور ژورنال",
      daily_review: "مرور روزانه",
      weekly_review: "مرور هفتگی"
    } as Record<string, string>,
    statuses: { active: "فعال", triggered: "اعلام‌شده", paused: "متوقف", archived: "بایگانی‌شده" } as Record<string, string>,
    columns: { type: "نوع", symbol: "نماد", status: "وضعیت", message: "پیام" },
    symbol: "نماد",
    operator: "شرط",
    price: "سطح قیمت",
    message: "پیام",
    create: "ساخت هشدار",
    saving: "در حال ذخیره...",
    saveFailed: "ذخیره هشدار ممکن نشد.",
    invalidPrice: "سطح قیمت را به صورت عدد وارد کنید، مثلاً ۶۵۰۰۰.",
    loadFailed: "بارگذاری هشدارها ممکن نشد.",
    emptyTitle: "هنوز هشداری نیست",
    emptyDescription: "هر هشدار یک سطح قیمت، حد ریسک یا مرور روزانه را به شما یادآوری می‌کند. اولین هشدار را با فرم بالا بسازید.",
    placeholders: { symbol: "BTCUSDT", price: "65000", message: "مثلاً قیمت به سطح مورد مرور رسید." }
  }
} as const;

export function AlertsScreen({ locale, messages }: { locale: Locale; messages: Messages }) {
  const c = copy[locale];
  // Only a price alert needs a symbol and a level; a risk or daily-review reminder does not.
  const [type, setType] = useState("price");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  // The empty state is only true once a load has worked: not while loading, and not after a failed load.
  const [listState, setListState] = useState<"loading" | "loaded" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const fieldLabels: Record<string, string> = { type: c.type, symbol: c.symbol, condition: c.price, message: c.message };

  async function load() {
    try {
      const data = await apiFetch<{ alerts: Alert[] }>("/api/alerts");
      setAlerts(data.alerts);
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
    const price = String(form.get("price") ?? "").trim();
    const symbol = String(form.get("symbol") ?? "").trim();
    const priceValue = price ? parseNumberInput(price) : null;
    if (priceValue !== null && !Number.isFinite(priceValue)) {
      setError(c.invalidPrice);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/api/alerts", {
        method: "POST",
        body: JSON.stringify({
          type: form.get("type"),
          symbol: symbol || null,
          condition: priceValue !== null ? { operator: form.get("operator"), price: priceValue } : {},
          message: form.get("message"),
          channels: ["in_app"]
        })
      });
      formEl.reset();
      setType("price");
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
      <PageHeader title={t(messages, "pages.alerts")} description={c.description} />
      {error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      <Card>
        <CardHeader><CardTitle>{c.formTitle}</CardTitle></CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-4" onSubmit={submit}>
            <Field label={c.type}>
              <Select name="type" defaultValue="price" onChange={(event) => setType(event.target.value)}>
                <option value="price">{c.types.price}</option>
                <option value="risk">{c.types.risk}</option>
                <option value="daily_review">{c.types.daily_review}</option>
              </Select>
            </Field>
            <Field label={type === "price" ? `${c.symbol} *` : c.symbol}>
              <Input name="symbol" placeholder={c.placeholders.symbol} required={type === "price"} />
            </Field>
            <Field label={c.operator}>
              <Select name="operator" defaultValue=">="><option value=">=">&gt;=</option><option value="<=">&lt;=</option></Select>
            </Field>
            <Field label={type === "price" ? `${c.price} *` : c.price}>
              <Input name="price" placeholder={c.placeholders.price} inputMode="decimal" required={type === "price"} />
            </Field>
            <div className="md:col-span-4">
              <Field label={`${c.message} *`}>
                <Textarea name="message" placeholder={c.placeholders.message} required minLength={2} />
              </Field>
            </div>
            <Button className="md:col-span-4" disabled={submitting}>{submitting ? c.saving : c.create}</Button>
          </form>
        </CardContent>
      </Card>
      {listState === "loading" ? <LoadingState locale={locale} /> : null}
      {listState === "loaded" ? (
        <DataTable
          rows={alerts}
          emptyTitle={c.emptyTitle}
          emptyDescription={c.emptyDescription}
          columns={[
            { key: "type", header: c.columns.type, cell: (row) => c.types[row.type] ?? row.type },
            { key: "symbol", header: c.columns.symbol, cell: (row) => row.symbol ?? "-" },
            { key: "status", header: c.columns.status, cell: (row) => <Badge tone={row.status === "active" ? "success" : "default"}>{c.statuses[row.status] ?? row.status}</Badge> },
            { key: "message", header: c.columns.message, cell: (row) => row.message }
          ]}
        />
      ) : null}
    </div>
  );
}

