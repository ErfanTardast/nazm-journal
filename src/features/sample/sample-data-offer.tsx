"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api/client";
import { apiErrorCode, apiErrorText } from "@/lib/api/error-text";
import type { Locale } from "@/lib/i18n/locales";
import { announceSampleChange, fetchSampleWorkspaceState, reloadPage, type SampleWorkspaceState } from "./sample-workspace-client";

const copy = {
  en: {
    title: "See this page with sample data",
    description:
      "Loads a month of sample forex and gold trades, with two strategies, two plans and two reviews, so you can see how the pages look with data in them. It is labelled as sample data and you can remove it at any time from the strip at the top of the page; your first real trade removes it too.",
    load: "Load sample data",
    loading: "Loading…",
    failed: "Could not load the sample data. Try again.",
    notEmpty: "Sample data can only be loaded into a journal with no trades of its own."
  },
  fa: {
    title: "این صفحه را با داده نمونه ببینید",
    description:
      "معاملات نمونه‌ی یک ماه فارکس و طلا، همراه با دو استراتژی، دو پلن و دو مرور بارگذاری می‌شود تا ببینید صفحه‌ها با داده چه شکلی‌اند. بالای هر صفحه با برچسب «داده نمونه» مشخص می‌شود و هر وقت بخواهید از همان‌جا حذفش می‌کنید؛ با اولین معامله‌ی واقعی‌تان هم خودکار پاک می‌شود.",
    load: "بارگذاری داده نمونه",
    loading: "در حال بارگذاری…",
    failed: "بارگذاری داده نمونه انجام نشد. دوباره تلاش کنید.",
    notEmpty: "داده نمونه فقط وقتی بارگذاری می‌شود که هیچ معامله‌ای از خودتان در ژورنال نباشد."
  }
} as const;

/**
 * A small card for a page with no data: "see this page with sample data". It asks the server by itself and renders
 * nothing when the account may not load sample data (it has trades of its own), when sample data is already loaded,
 * while it is asking and when the question failed. The button loads the labelled sample workspace; the page then fetches
 * its data again (the workspace shell remounts it), or reloads when there is no shell around the card.
 */
export function SampleDataOffer({ locale }: { locale: Locale }) {
  const c = copy[locale];
  const [state, setState] = useState<SampleWorkspaceState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void fetchSampleWorkspaceState().then((next) => {
      if (mounted.current) setState(next);
    });
    return () => {
      mounted.current = false;
    };
  }, []);

  async function load() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const loaded = await apiFetch<{ loadedAt?: string }>("/api/sample-workspace", { method: "POST", body: JSON.stringify({ locale }) });
      // The shell, when there is one, remounts the page so it fetches its data again; otherwise reload it here (the
      // card stays, busy, until the page is gone).
      if (!announceSampleChange()) reloadPage();
      else if (mounted.current) setState({ active: true, loadedAt: loaded?.loadedAt ?? null, canLoad: true });
    } catch (failure) {
      if (!mounted.current) return;
      setError(apiErrorCode(failure) === "SAMPLE_NOT_EMPTY" ? c.notEmpty : apiErrorText(failure, locale, c.failed));
      setBusy(false);
    }
  }

  if (!state?.canLoad || state.active) return null;

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 sm:max-w-2xl">
          <p className="text-sm font-semibold text-foreground">{c.title}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{c.description}</p>
          {error ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-border bg-muted/80 px-4 text-sm font-semibold text-foreground transition hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? c.loading : c.load}
        </button>
      </CardContent>
    </Card>
  );
}
