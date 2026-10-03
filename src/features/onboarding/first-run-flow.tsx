"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/state";
import { ChoiceGroup, type Choice } from "@/features/onboarding/choice-group";
import { apiFetch, isAuthError } from "@/lib/api/client";
import { apiErrorCode, apiErrorText } from "@/lib/api/error-text";
import { t, type getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";
import {
  FLOW_STEP_COUNT,
  PRIMARY_GOALS,
  TRADING_PLATFORMS,
  emptyFirstRunState,
  firstOpenStep,
  normalizeFirstRunState,
  type FirstRunState,
  type FlowStep,
  type PrimaryGoal,
  type TradingPlatform
} from "@/lib/onboarding/first-run";
import { localizeDigits } from "@/lib/services/locale";
import { cn } from "@/lib/utils";

type Messages = ReturnType<typeof getMessages>;
type Answer = { tradingPlatform: TradingPlatform } | { primaryGoal: PrimaryGoal };
type SampleStatus = "idle" | "loading" | "failed" | "notEmpty";

const STATE_URL = "/api/onboarding/state";
const SAMPLE_URL = "/api/sample-workspace";
/** Leaving the flow waits this long for the "done" mark to be saved, then goes on: a slow request must not trap anyone here. */
const MARK_DONE_WAIT_MS = 3000;

const linkBase =
  "inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const linkVariants = {
  primary: "bg-primary text-primary-foreground shadow-sm shadow-primary/20 hover:brightness-110",
  secondary: "border border-border bg-muted/80 text-foreground hover:border-primary/40 hover:bg-muted"
} as const;

function LinkButton({ href, variant, children }: { href: string; variant: keyof typeof linkVariants; children: ReactNode }) {
  return (
    <Link href={href} className={cn(linkBase, linkVariants[variant])}>
      {children}
    </Link>
  );
}

/**
 * The guided first run: one question or action at a time, saved as it goes, with a progress bar, "Skip for now" on every
 * step and a way back. What a person has answered or already has decides where they resume. The flow never blocks:
 * a failed request is worded on the screen and the person can always skip, go back or go on to the dashboard.
 * `onAuthRequired` should be a stable function: the saved state is read once, when it changes.
 */
export function FirstRunFlow({ messages, locale, onAuthRequired }: { messages: Messages; locale: Locale; onAuthRequired: () => void }) {
  const router = useRouter();
  const tr = (key: string) => t(messages, `onboarding.flow.${key}`);
  const headingId = useId();
  const hintId = useId();

  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [state, setState] = useState<FirstRunState>(emptyFirstRunState);
  const [step, setStep] = useState<FlowStep>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sample, setSample] = useState<SampleStatus>("idle");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stepRef = useRef<FlowStep>(1);
  const focusHeading = useRef(false);
  const leaving = useRef(false);
  /** Counts the sample requests and the departures: an answer that arrives after the person left is not theirs to act on. */
  const sampleRun = useRef(0);

  useEffect(() => {
    let active = true;
    apiFetch<unknown>(STATE_URL)
      .then((data) => {
        if (!active) return;
        const saved = normalizeFirstRunState(data);
        const resume = firstOpenStep(saved);
        stepRef.current = resume;
        setState(saved);
        setStep(resume);
        setLoaded(true);
      })
      .catch((err) => {
        if (!active) return;
        if (isAuthError(err)) {
          onAuthRequired();
          return;
        }
        // Not being able to read what was saved must not close the flow: it starts from the first step.
        setLoadFailed(true);
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [onAuthRequired]);

  // When the step changes because the person moved, the new step's heading takes focus (not on the first paint).
  useEffect(() => {
    if (!focusHeading.current) return;
    focusHeading.current = false;
    headingRef.current?.focus();
  }, [step]);

  function goTo(next: number) {
    const target = Math.min(Math.max(next, 1), FLOW_STEP_COUNT) as FlowStep;
    stepRef.current = target;
    focusHeading.current = true;
    setError(null);
    setSample("idle");
    setStep(target);
  }

  /** Saves one answer, and only that answer, so a screen that loaded earlier can never overwrite a newer one; then goes on. */
  async function choose(answer: Answer, unchanged: boolean, next: FlowStep) {
    if (saving) return;
    if (unchanged) {
      goTo(next);
      return;
    }
    const from = stepRef.current;
    setSaving(true);
    setError(null);
    try {
      const data = await apiFetch<unknown>(STATE_URL, { method: "POST", body: JSON.stringify(answer) });
      const fresh = data && typeof data === "object" && (data as { state?: unknown }).state ? normalizeFirstRunState(data) : null;
      setState((previous) => ({
        ...previous,
        ...(fresh ? { hasTrades: fresh.hasTrades, hasStrategy: fresh.hasStrategy, hasPlan: fresh.hasPlan, hasSample: fresh.hasSample } : {}),
        ...answer
      }));
      // An answer was saved, so the saved setup is known again and the "could not read it" note is no longer true.
      setLoadFailed(false);
      // The person may have gone back or skipped while it was saving: then they stay where they chose to be.
      if (stepRef.current === from) goTo(next);
    } catch (err) {
      if (isAuthError(err)) onAuthRequired();
      else setError(apiErrorText(err, locale, tr("saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  async function markDone() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        apiFetch(STATE_URL, { method: "POST", body: JSON.stringify({ done: true }) }),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, MARK_DONE_WAIT_MS);
        })
      ]);
    } catch {
      // Leaving matters more than recording it: the dashboard's setup card still offers what is left.
    } finally {
      clearTimeout(timer);
    }
  }

  /** Skipping, finishing and "go to the dashboard" are one thing: mark the flow done (best effort) and open the dashboard. */
  async function leave() {
    if (leaving.current) return;
    leaving.current = true;
    sampleRun.current += 1;
    await markDone();
    router.push(`/${locale}/dashboard`);
    leaving.current = false;
  }

  async function loadSample() {
    if (sample === "loading" || leaving.current) return;
    const run = (sampleRun.current += 1);
    setSample("loading");
    try {
      await apiFetch(SAMPLE_URL, { method: "POST" });
    } catch (err) {
      if (run !== sampleRun.current) {
        // The person left while it was loading: nothing here is theirs to see any more.
        setSample("idle");
        return;
      }
      if (isAuthError(err)) {
        onAuthRequired();
        return;
      }
      if (apiErrorCode(err) === "SAMPLE_NOT_EMPTY") {
        // The server says the journal has trades of its own: remember it, so going back and forward does not offer
        // sample data again or show the history step as still to do.
        setState((previous) => ({ ...previous, hasTrades: true }));
        setSample("notEmpty");
      } else setSample("failed");
      return;
    }
    if (run !== sampleRun.current) {
      // "Skip for now" was chosen while it was loading and is already taking the person to the dashboard: do not do it twice.
      setSample("idle");
      return;
    }
    await leave();
  }

  if (!loaded) {
    return (
      <Card data-first-run>
        <CardContent>
          <LoadingState label={tr("loading")} locale={locale} />
          {/* A slow answer must not hold anyone here either. */}
          <div className="flex justify-end">
            <Button variant="ghost" onClick={leave}>
              {tr("skip")}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const digits = (value: number) => localizeDigits(String(value), locale);
  const progressText = tr("progress").replace("{n}", digits(step)).replace("{total}", digits(FLOW_STEP_COUNT));
  const platform = state.tradingPlatform ?? "manual";
  // Sample data is for an empty journal: someone who has trades of their own (or just heard so from the server) gets
  // a last step that says nothing about it, instead of one that promises an empty dashboard.
  // Sample data that is already loaded is not offered again, and the dashboard is not called empty.
  const canOfferSample = !state.hasTrades && !state.hasSample && sample !== "notEmpty";
  const finishOwnBody = state.hasSample && !state.hasTrades ? tr("finish.bodySample") : tr("finish.bodyOwn");

  const platformChoices: Choice<TradingPlatform>[] = TRADING_PLATFORMS.map((value) => ({
    value,
    title: tr(`platform.${value}.title`),
    description: tr(`platform.${value}.description`)
  }));
  const goalChoices: Choice<PrimaryGoal>[] = PRIMARY_GOALS.map((value) => ({
    value,
    title: tr(`goal.${value}.title`),
    description: tr(`goal.${value}.description`)
  }));

  const headings: Record<FlowStep, string> = {
    1: tr("platform.title"),
    2: tr("goal.title"),
    3: tr(`history.${platform}.title`),
    4: tr("strategy.title"),
    5: canOfferSample ? tr("finish.title") : tr("finish.titleOwn")
  };
  // A step that is already done says so with a done mark below instead of explaining what to do.
  const hints: Record<FlowStep, string | null> = {
    1: tr("platform.hint"),
    2: tr("goal.hint"),
    3: state.hasTrades ? null : tr(`history.${platform}.body`),
    4: state.hasStrategy ? null : tr("strategy.body"),
    5: canOfferSample ? tr("finish.body") : finishOwnBody
  };
  const historyHref = `/${locale}/${platform === "manual" ? "journal" : "import"}`;

  /** A step that is already done shows a done mark and a way on; an open one shows its action and "Later". */
  const doneMark = (text: string) => (
    <p className="flex items-start gap-2 text-sm font-medium text-foreground">
      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
      <span>
        <span className="sr-only">{tr("done")}: </span>
        {text}
      </span>
    </p>
  );

  return (
    <Card data-first-run>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">{progressText}</p>
          <div
            role="progressbar"
            aria-label={tr("progressLabel")}
            aria-valuemin={1}
            aria-valuemax={FLOW_STEP_COUNT}
            aria-valuenow={step}
            aria-valuetext={progressText}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(step / FLOW_STEP_COUNT) * 100}%` }} />
          </div>
        </div>

        {loadFailed ? (
          <p role="status" className="rounded-md border border-border bg-muted/30 p-3 text-sm leading-6 text-muted-foreground">
            {tr("loadFailed")}
          </p>
        ) : null}

        <div className="space-y-2">
          <h2 key={step} id={headingId} ref={headingRef} tabIndex={-1} className="break-words text-xl font-semibold tracking-normal text-foreground outline-none">
            {headings[step]}
          </h2>
          {hints[step] ? (
            <p id={hintId} className="max-w-2xl break-words text-sm leading-6 text-muted-foreground">
              {hints[step]}
            </p>
          ) : null}
        </div>

        {step === 1 ? (
          <ChoiceGroup
            key="platform"
            labelledBy={headingId}
            describedBy={hintId}
            choices={platformChoices}
            value={state.tradingPlatform}
            busy={saving}
            onChoose={(value) => choose({ tradingPlatform: value }, state.tradingPlatform === value, 2)}
          />
        ) : null}

        {step === 2 ? (
          <ChoiceGroup
            key="goal"
            labelledBy={headingId}
            describedBy={hintId}
            choices={goalChoices}
            value={state.primaryGoal}
            busy={saving}
            onChoose={(value) => choose({ primaryGoal: value }, state.primaryGoal === value, 3)}
          />
        ) : null}

        {step === 1 && state.tradingPlatform ? (
          <Button onClick={() => goTo(2)}>{tr("continue")}</Button>
        ) : null}
        {step === 2 && state.primaryGoal ? (
          <Button onClick={() => goTo(3)}>{tr("continue")}</Button>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            {state.hasTrades ? doneMark(tr("history.done")) : null}
            <div className="flex flex-wrap items-center gap-3">
              <LinkButton href={historyHref} variant={state.hasTrades ? "secondary" : "primary"}>
                {tr(`history.${platform}.action`)}
              </LinkButton>
              {state.hasTrades ? <Button onClick={() => goTo(4)}>{tr("continue")}</Button> : <Button variant="ghost" onClick={() => goTo(4)}>{tr("later")}</Button>}
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4">
            {state.hasStrategy ? doneMark(tr("strategy.done")) : null}
            <div className="flex flex-wrap items-center gap-3">
              <LinkButton href={`/${locale}/strategies`} variant={state.hasStrategy ? "secondary" : "primary"}>
                {tr("strategy.action")}
              </LinkButton>
              {state.hasStrategy ? <Button onClick={() => goTo(5)}>{tr("continue")}</Button> : <Button variant="ghost" onClick={() => goTo(5)}>{tr("later")}</Button>}
            </div>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="space-y-4">
            {canOfferSample ? (
              <p className="rounded-md border border-border bg-muted/30 p-3 text-sm leading-6 text-muted-foreground">{tr("finish.sampleNote")}</p>
            ) : null}
            {sample === "failed" ? (
              <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm leading-6 text-destructive">
                {tr("finish.sampleFailed")}
              </p>
            ) : null}
            {sample === "notEmpty" ? (
              <p role="alert" className="rounded-md border border-border bg-muted/30 p-3 text-sm leading-6 text-foreground">
                {tr("finish.sampleNotEmpty")}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              {canOfferSample ? (
                <Button onClick={loadSample} disabled={sample === "loading"}>
                  {sample === "loading" ? tr("finish.sampling") : tr("finish.sample")}
                </Button>
              ) : null}
              {/* While the sample is loading, "Skip for now" is the way out: choosing the empty dashboard now would contradict the request. */}
              <Button variant={canOfferSample ? "secondary" : "primary"} onClick={leave} disabled={sample === "loading"}>
                {canOfferSample ? tr("finish.empty") : tr("finish.dashboard")}
              </Button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm leading-6 text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          {step > 1 ? (
            <Button variant="ghost" onClick={() => goTo(step - 1)} disabled={sample === "loading"}>
              {tr("back")}
            </Button>
          ) : (
            <span />
          )}
          <Button variant="ghost" onClick={leave}>
            {tr("skip")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
