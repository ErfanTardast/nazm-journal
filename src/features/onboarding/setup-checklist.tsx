"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, isAuthError } from "@/lib/api/client";
import { apiErrorText } from "@/lib/api/error-text";
import type { Locale } from "@/lib/i18n/locales";
import { emptyFirstRunState, normalizeFirstRunState, type FirstRunState } from "@/lib/onboarding/first-run";
import { localizeDigits } from "@/lib/services/locale";

const STATE_URL = "/api/onboarding/state";
const STEP_COUNT = 3;

/** This card sits on the dashboard, which does not hand it the message files: its words live here. */
const copy = {
  en: {
    title: "Getting started",
    progress: (done: string, total: string) => `${done} of ${total} done`,
    steps: {
      trade: "Import or add your first trade",
      strategy: "Create your first strategy",
      plan: "Write your first plan"
    },
    links: {
      import: "Import trades",
      journal: "Open the journal",
      strategies: "Create a strategy",
      plans: "Write a plan"
    },
    continueSetup: "Continue setup",
    dismiss: "Skip guided setup",
    done: "Done",
    todo: "To do",
    dismissFailed: "That could not be saved. Try again."
  },
  fa: {
    title: "شروع کار",
    progress: (done: string, total: string) => `${done} از ${total} انجام شد`,
    steps: {
      trade: "ورود یا ثبت اولین معامله",
      strategy: "ساخت اولین استراتژی",
      plan: "نوشتن اولین پلن"
    },
    links: {
      import: "ورود معاملات",
      journal: "باز کردن ژورنال",
      strategies: "ساخت استراتژی",
      plans: "نوشتن پلن"
    },
    continueSetup: "ادامه راه‌اندازی",
    dismiss: "صرف‌نظر از راه‌اندازی گام‌به‌گام",
    done: "انجام شد",
    todo: "انجام نشده",
    dismissFailed: "ذخیره نشد. دوباره تلاش کنید."
  }
} as const;

type Status = "loading" | "hidden" | "ready";
type Step = { key: "trade" | "strategy" | "plan"; done: boolean; links: { href: string; label: string }[] };

/** True for an answer that carries a first-run state (anything else, such as a stray response, is not shown as one). */
function carriesState(data: unknown): boolean {
  return Boolean(data) && typeof data === "object" && typeof (data as { state?: unknown }).state === "object" && (data as { state?: unknown }).state !== null;
}

const linkClass =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-muted/60 px-3 text-sm font-semibold text-foreground transition hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/**
 * A compact "getting started" card for the dashboard: import or add a first trade, create a first strategy, write a
 * first plan, each with a done mark and a link. While the first run has not been finished or skipped it also offers the
 * guided setup and a way to skip it; afterwards it lists only what is still open. It shows nothing while loading, when
 * the request fails, and once all three are done, and it never throws.
 */
export function SetupChecklist({ locale }: { locale: Locale }) {
  const c = copy[locale];
  const headingId = useId();
  const [status, setStatus] = useState<Status>("loading");
  const [state, setState] = useState<FirstRunState>(emptyFirstRunState);
  const [dismissing, setDismissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<unknown>(STATE_URL)
      .then((data) => {
        if (!active) return;
        if (!carriesState(data)) {
          setStatus("hidden");
          return;
        }
        setState(normalizeFirstRunState(data));
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("hidden");
      });
    return () => {
      active = false;
    };
  }, []);

  /** Dismissing is finishing the first run: the guided-setup line goes and the done steps are no longer listed. */
  async function dismiss() {
    setDismissing(true);
    setError(null);
    try {
      const data = await apiFetch<unknown>(STATE_URL, { method: "POST", body: JSON.stringify({ done: true }) });
      const saved = carriesState(data) ? normalizeFirstRunState(data) : state;
      setState({ ...saved, onboardedAt: saved.onboardedAt ?? new Date().toISOString() });
    } catch (err) {
      if (isAuthError(err)) setStatus("hidden");
      else setError(apiErrorText(err, locale, c.dismissFailed));
    } finally {
      setDismissing(false);
    }
  }

  if (status !== "ready") return null;
  if (state.hasTrades && state.hasStrategy && state.hasPlan) return null;

  const importLink = { href: `/${locale}/import`, label: c.links.import };
  const journalLink = { href: `/${locale}/journal`, label: c.links.journal };
  const steps: Step[] = [
    {
      key: "trade",
      done: state.hasTrades,
      // Someone who imports gets the import page, someone who types gets the journal, and when it is not known both are offered.
      links: state.tradingPlatform === "manual" ? [journalLink] : state.tradingPlatform ? [importLink] : [importLink, journalLink]
    },
    { key: "strategy", done: state.hasStrategy, links: [{ href: `/${locale}/strategies`, label: c.links.strategies }] },
    { key: "plan", done: state.hasPlan, links: [{ href: `/${locale}/plans`, label: c.links.plans }] }
  ];
  const finished = state.onboardedAt !== null;
  const doneCount = steps.filter((step) => step.done).length;
  const shown = finished ? steps.filter((step) => !step.done) : steps;

  return (
    <Card role="region" aria-labelledby={headingId}>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle id={headingId}>{c.title}</CardTitle>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {c.progress(localizeDigits(String(doneCount), locale), localizeDigits(String(STEP_COUNT), locale))}
          </p>
        </div>
        {finished ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/${locale}/onboarding`}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {c.continueSetup}
            </Link>
            <Button variant="ghost" onClick={dismiss} disabled={dismissing}>
              {c.dismiss}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="grid gap-3">
          {shown.map((step) => (
            <li key={step.key} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/20 p-3">
              <span className="flex min-w-0 flex-1 items-center gap-3 text-sm">
                {step.done ? (
                  <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
                ) : (
                  <Circle className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <span className="sr-only">{step.done ? c.done : c.todo}</span>
                <span className="min-w-0 break-words font-medium text-foreground">{c.steps[step.key]}</span>
              </span>
              <span className="flex flex-wrap gap-2">
                {step.links.map((link) => (
                  <Link key={link.href} href={link.href} className={linkClass}>
                    {link.label}
                  </Link>
                ))}
              </span>
            </li>
          ))}
        </ul>
        {error ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
