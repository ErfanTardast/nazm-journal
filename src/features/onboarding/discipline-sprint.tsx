"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SectionPanel } from "@/components/ui/section-panel";
import { Select } from "@/components/ui/select";
import { apiFetch, isAuthError } from "@/lib/api/client";
import { apiErrorText } from "@/lib/api/error-text";
import { t, type getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";
import { formatGeneratedDate, localizeDigits } from "@/lib/services/locale";

type Messages = ReturnType<typeof getMessages>;

type Plan = {
  segment: string;
  defaultRiskPercent: number;
  focusAreas: string[];
  recommendedFeatures: string[];
  startingChecklist: string[];
  language: string;
};

type DisciplineSprintData = {
  title: string;
  startDate: string;
  endDate: string;
  targetMistake: string;
  sessionRule: string;
  riskDefaults: {
    riskPerTradePct: number;
    maxDailyLossPct: number;
    maxWeeklyLossPct: number;
  };
  starterPlaybook: {
    name: string;
  };
  days: { day: number; date: string; targetScore: number; focus: string; reviewPrompt: string }[];
};

type SavedProfile = Plan & {
  id: string;
  experience: string;
  market: string;
  disciplineIssue: string;
  sprint: DisciplineSprintData;
  starterStrategyId: string | null;
  firstReviewId: string | null;
  completedAt: string;
};

const EXPERIENCES = ["beginner", "intermediate", "advanced"] as const;
const MARKETS = ["crypto", "forex", "stocks"] as const;
const ISSUES = ["overtrading", "revenge", "moving_stops", "fomo", "no_plan", "oversizing"] as const;
/** The feature names the plan recommends (see `onboarding/segmentation`); one that is not here is left out rather than shown raw. */
const FEATURES = ["trading-session", "journal", "risk-calculator", "learning", "performance"] as const;

const isOneOf = <T extends string>(list: readonly T[], value: string | undefined): value is T => list.includes(value as T);

/**
 * The optional extra of the first run: four questions become a discipline-first plan and a 7-day sprint. It never gets
 * in the way of the guided flow above it, and it leaves the first-run state alone. `onAuthRequired` should be a stable
 * function: the saved sprint is read once, when it changes.
 */
export function DisciplineSprint({ messages, locale, onAuthRequired }: { messages: Messages; locale: Locale; onAuthRequired: () => void }) {
  const tr = (key: string) => t(messages, `onboarding.${key}`);
  const [experience, setExperience] = useState<string>("beginner");
  const [market, setMarket] = useState<string>("crypto");
  const [issue, setIssue] = useState<string>("no_plan");
  const [language, setLanguage] = useState<string>(locale);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [savedProfile, setSavedProfile] = useState<SavedProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ profile: SavedProfile | null }>("/api/onboarding/sprint")
      .then((data) => {
        if (data.profile) {
          setSavedProfile(data.profile);
          setPlan(data.profile);
        }
      })
      .catch((err) => {
        // A saved sprint is optional, so other failures stay quiet; a missing session is not.
        if (isAuthError(err)) onAuthRequired();
      });
  }, [onAuthRequired]);

  async function buildPlan() {
    setError(null);
    try {
      const params = new URLSearchParams({ experience, market, disciplineIssue: issue, language });
      setPlan(await apiFetch<Plan>(`/api/onboarding/plan?${params.toString()}`));
    } catch (err) {
      if (isAuthError(err)) {
        onAuthRequired();
        return;
      }
      setError(apiErrorText(err, locale, tr("buildFailed")));
    }
  }

  async function saveSprint() {
    setSaving(true);
    setError(null);
    try {
      const data = await apiFetch<{ profile: SavedProfile }>("/api/onboarding/sprint", {
        method: "POST",
        body: JSON.stringify({ experience, market, disciplineIssue: issue, language })
      });
      setSavedProfile(data.profile);
      setPlan(data.profile);
    } catch (err) {
      if (isAuthError(err)) {
        onAuthRequired();
        return;
      }
      setError(apiErrorText(err, locale, tr("saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  /** "Beginner · Crypto · Trading without a plan" from the stored segment ("beginner-crypto-no_plan"); a part this screen does not know is left out. */
  function describeSegment(segment: string) {
    const [first, second, ...rest] = segment.split("-");
    const parts = [
      isOneOf(EXPERIENCES, first) ? tr(`exp.${first}`) : null,
      isOneOf(MARKETS, second) ? tr(`market.${second}`) : null,
      isOneOf(ISSUES, rest.join("-")) ? tr(`issue.${rest.join("-")}`) : null
    ];
    return parts.filter(Boolean).join(" · ");
  }

  const digits = (value: number | string) => localizeDigits(String(value), locale);
  const percent = (value: number) => `${digits(value)}${locale === "fa" ? "٪" : "%"}`;
  const planFeatures = plan ? plan.recommendedFeatures.filter((feature): feature is (typeof FEATURES)[number] => isOneOf(FEATURES, feature)) : [];

  return (
    <div className="space-y-6">
      <SectionPanel title={tr("sprintHeading")} description={tr("subtitle")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tr("experienceLabel")}>
            <Select value={experience} onChange={(e) => setExperience(e.target.value)}>
              {EXPERIENCES.map((v) => (
                <option key={v} value={v}>{tr(`exp.${v}`)}</option>
              ))}
            </Select>
          </Field>
          <Field label={tr("marketLabel")}>
            <Select value={market} onChange={(e) => setMarket(e.target.value)}>
              {MARKETS.map((v) => (
                <option key={v} value={v}>{tr(`market.${v}`)}</option>
              ))}
            </Select>
          </Field>
          <Field label={tr("issueLabel")}>
            <Select value={issue} onChange={(e) => setIssue(e.target.value)}>
              {ISSUES.map((v) => (
                <option key={v} value={v}>{tr(`issue.${v}`)}</option>
              ))}
            </Select>
          </Field>
          <Field label={tr("languageLabel")}>
            <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="en">{tr("lang.en")}</option>
              <option value="fa">{tr("lang.fa")}</option>
            </Select>
          </Field>
        </div>
        <Button className="mt-4 w-fit" onClick={buildPlan}>{tr("build")}</Button>
        {error ? <p role="alert" className="mt-2 text-sm text-destructive">{error}</p> : null}
      </SectionPanel>

      {plan ? (
        <SectionPanel title={tr("planFor")} description={describeSegment(plan.segment)}>
          <div className="grid gap-3 text-sm">
            <Badge tone="success">{tr("defaultRisk")}: {percent(plan.defaultRiskPercent)}</Badge>
            <div>
              <p className="font-medium text-foreground">{tr("focusAreas")}</p>
              <ul className="mt-1 grid gap-0.5 text-muted-foreground">
                {plan.focusAreas.map((f) => <li key={f}>• {f}</li>)}
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground">{tr("startingChecklist")}</p>
              <ul className="mt-1 grid gap-0.5 text-muted-foreground">
                {plan.startingChecklist.map((c) => <li key={c}>• {c}</li>)}
              </ul>
            </div>
            <div className="flex flex-wrap gap-1">
              {planFeatures.map((feat) => <Badge key={feat} tone="default">{tr(`feature.${feat}`)}</Badge>)}
            </div>
            <Button className="w-fit" onClick={saveSprint} disabled={saving}>
              {saving ? tr("savingSprint") : tr("saveSprint")}
            </Button>
          </div>
        </SectionPanel>
      ) : null}

      {savedProfile ? (
        <SectionPanel
          title={tr("sprintTitle")}
          description={`${formatGeneratedDate(savedProfile.sprint.startDate, locale)} - ${formatGeneratedDate(savedProfile.sprint.endDate, locale)}`}
        >
          <div className="grid gap-4 text-sm">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-border bg-muted/20 p-3">
                <p className="text-xs font-semibold text-muted-foreground">{tr("targetMistake")}</p>
                <p className="mt-1 font-semibold text-foreground">{savedProfile.sprint.targetMistake}</p>
              </div>
              <div className="rounded-md border border-border bg-muted/20 p-3">
                <p className="text-xs font-semibold text-muted-foreground">{tr("sessionRule")}</p>
                <p className="mt-1 font-semibold text-foreground">{savedProfile.sprint.sessionRule}</p>
              </div>
              <div className="rounded-md border border-border bg-muted/20 p-3">
                <p className="text-xs font-semibold text-muted-foreground">{tr("starterPlaybook")}</p>
                <p className="mt-1 font-semibold text-foreground">{savedProfile.sprint.starterPlaybook.name}</p>
              </div>
            </div>

            <div>
              <p className="mb-2 font-medium text-foreground">{tr("scoreArc")}</p>
              <div className="grid gap-2 sm:grid-cols-7">
                {savedProfile.sprint.days.map((day) => (
                  <div key={day.day} className="rounded-md border border-border bg-muted/20 p-2">
                    <p className="text-xs font-semibold text-muted-foreground">{tr("dayLabel").replace("{n}", digits(day.day))}</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{digits(day.targetScore)}</p>
                    <p className="mt-1 text-xs leading-4 text-muted-foreground">{day.focus}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {savedProfile.firstReviewId ? (
                <Link href={`/${locale}/reviews`} className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
                  {tr("openReview")}
                </Link>
              ) : null}
              {savedProfile.starterStrategyId ? (
                <Link href={`/${locale}/strategies`} className="inline-flex min-h-11 items-center rounded-md border border-border bg-muted/70 px-4 text-sm font-semibold text-foreground">
                  {tr("openPlaybook")}
                </Link>
              ) : null}
            </div>
          </div>
        </SectionPanel>
      ) : null}
    </div>
  );
}
