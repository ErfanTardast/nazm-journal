"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SectionPanel } from "@/components/ui/section-panel";
import { Select } from "@/components/ui/select";
import { AuthRequiredState, LoadingState } from "@/components/ui/state";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, isAuthError } from "@/lib/api/client";
import { apiErrorText } from "@/lib/api/error-text";
import { t, type getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";

type Messages = ReturnType<typeof getMessages>;
type Watchlist = {
  id: string;
  name: string;
  items: { id: string; symbol: string; market: string; notes: string | null; strategyNotes?: string | null }[];
};

const copy = {
  en: {
    eyebrow: "Context organization",
    description: "Organize symbols for market context, strategy suitability notes, and news review.",
    newList: "New watchlist",
    newListDesc: "Use watchlists for context and review notes.",
    listName: "Watchlist name",
    note: "Context note",
    save: "Save watchlist",
    saving: "Saving...",
    market: "Market",
    markets: { crypto: "Crypto", forex: "Forex", stocks: "Global stocks" } as Record<string, string>,
    placeholders: {
      name: "e.g. Macro context",
      symbol: "EURUSD",
      notes: "e.g. Review the calendar before planning this symbol."
    },
    symbols: "Symbols under review",
    symbolsDesc: "Related strategy and news notes can be expanded through the symbol-note model.",
    notes: "Notes",
    list: "List",
    loadFailed: "Watchlists failed to load.",
    saveFailed: "The watchlist could not be saved.",
    emptyTitle: "No watchlists yet",
    emptyDescription: "A watchlist keeps the symbols you follow, with a context note for each. Create your first one with the New watchlist form."
  },
  fa: {
    eyebrow: "سازماندهی زمینه",
    description: "نمادها را برای زمینه بازار، یادداشت‌های استراتژی و مرور اخبار نگه‌داری کنید.",
    newList: "فهرست جدید",
    newListDesc: "از فهرست‌ها برای زمینه و یادداشت مرور استفاده کنید.",
    listName: "نام فهرست",
    note: "یادداشت زمینه",
    save: "ذخیره فهرست",
    saving: "در حال ذخیره...",
    market: "بازار",
    markets: { crypto: "کریپتو", forex: "فارکس", stocks: "سهام جهانی" } as Record<string, string>,
    placeholders: {
      name: "مثلاً زمینه کلان",
      symbol: "EURUSD",
      notes: "مثلاً پیش از برنامه‌ریزی برای این نماد تقویم اقتصادی را مرور کنید."
    },
    symbols: "نمادهای تحت مرور",
    symbolsDesc: "یادداشت‌های مرتبط با استراتژی و خبر از طریق مدل یادداشت نماد قابل گسترش است.",
    notes: "یادداشت",
    list: "فهرست",
    loadFailed: "بارگذاری فهرست‌ها ممکن نشد.",
    saveFailed: "ذخیره فهرست ممکن نشد.",
    emptyTitle: "هنوز فهرستی نیست",
    emptyDescription: "در فهرست نمادها، نمادهایی را که دنبال می‌کنید همراه با یادداشت زمینه هرکدام نگه می‌دارید. اولین فهرست را با فرم «فهرست جدید» بسازید."
  }
} as const;

export function WatchlistsScreen({ locale, messages }: { locale: Locale; messages: Messages }) {
  const c = copy[locale];
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  // The empty state is only true once a load has worked: not while loading, and not after a failed load.
  const [listState, setListState] = useState<"loading" | "loaded" | "failed">("loading");
  // The failed request's error (to tell a signed-out visitor apart) and the line to show for it in the page language.
  const [failure, setFailure] = useState<{ error: unknown; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // The server reports the nested item fields together under "items".
  const fieldLabels: Record<string, string> = { name: c.listName, items: [t(messages, "common.symbol"), c.market, c.note].join(locale === "fa" ? "، " : ", ") };

  async function load() {
    try {
      const data = await apiFetch<{ watchlists: Watchlist[] }>("/api/watchlists");
      setWatchlists(data.watchlists);
      setListState("loaded");
      setFailure(null);
    } catch (err) {
      setListState((state) => (state === "loaded" ? state : "failed"));
      setFailure({ error: err, text: apiErrorText(err, locale, c.loadFailed) });
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
    setFailure(null);
    try {
      await apiFetch("/api/watchlists", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          items: [
            {
              symbol: form.get("symbol"),
              market: form.get("market"),
              notes: form.get("notes")
            }
          ]
        })
      });
      formEl.reset();
      await load();
    } catch (err) {
      setFailure({ error: err, text: apiErrorText(err, locale, c.saveFailed, fieldLabels) });
    } finally {
      setSubmitting(false);
    }
  }

  if (failure && isAuthError(failure.error)) return <AuthRequiredState locale={locale} />;

  const rows = watchlists.flatMap((watchlist) =>
    watchlist.items.map((item) => ({
      ...item,
      watchlist: watchlist.name
    }))
  );

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={c.eyebrow} title={t(messages, "pages.watchlists")} description={c.description} />
      {failure ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{failure.text}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionPanel title={c.newList} description={c.newListDesc}>
          <form className="grid gap-3" onSubmit={submit}>
            <Field label={`${c.listName} *`}>
              <Input name="name" placeholder={c.placeholders.name} required minLength={2} />
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label={`${t(messages, "common.symbol")} *`}>
                <Input name="symbol" placeholder={c.placeholders.symbol} required />
              </Field>
              <Field label={c.market}>
                <Select name="market" defaultValue="forex">
                  <option value="forex">{c.markets.forex}</option>
                  <option value="crypto">{c.markets.crypto}</option>
                  <option value="stocks">{c.markets.stocks}</option>
                </Select>
              </Field>
            </div>
            <Field label={c.note}>
              <Textarea name="notes" placeholder={c.placeholders.notes} />
            </Field>
            <Button disabled={submitting}>{submitting ? c.saving : c.save}</Button>
          </form>
        </SectionPanel>

        <SectionPanel title={c.symbols} description={c.symbolsDesc}>
          {listState === "loading" ? <LoadingState locale={locale} /> : null}
          {listState === "loaded" ? (
            <DataTable
              rows={rows}
              emptyTitle={c.emptyTitle}
              emptyDescription={c.emptyDescription}
              columns={[
                { key: "watchlist", header: c.list, cell: (row) => row.watchlist },
                { key: "symbol", header: t(messages, "common.symbol"), cell: (row) => <span className="font-medium text-foreground">{row.symbol}</span> },
                { key: "market", header: c.market, cell: (row) => <Badge>{c.markets[row.market] ?? row.market}</Badge> },
                { key: "notes", header: c.notes, cell: (row) => row.notes ?? "-" }
              ]}
            />
          ) : null}
        </SectionPanel>
      </div>
    </div>
  );
}
