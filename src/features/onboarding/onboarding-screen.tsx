"use client";

import { useCallback, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { AuthRequiredState } from "@/components/ui/state";
import { DisciplineSprint } from "@/features/onboarding/discipline-sprint";
import { FirstRunFlow } from "@/features/onboarding/first-run-flow";
import { t, type getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";

type Messages = ReturnType<typeof getMessages>;

/**
 * The first run. The guided flow comes first (how you trade, your goal, your history, your first strategy, the
 * dashboard); the discipline sprint stays below it as an optional extra and never stands in the flow's way.
 */
export function OnboardingScreen({ messages, locale }: { messages: Messages; locale: Locale }) {
  const [authRequired, setAuthRequired] = useState(false);
  const onAuthRequired = useCallback(() => setAuthRequired(true), []);

  if (authRequired) return <AuthRequiredState locale={locale} />;

  return (
    <div className="space-y-6">
      <PageHeader title={t(messages, "onboarding.title")} description={t(messages, "onboarding.intro")} />
      <FirstRunFlow messages={messages} locale={locale} onAuthRequired={onAuthRequired} />
      <DisciplineSprint messages={messages} locale={locale} onAuthRequired={onAuthRequired} />
    </div>
  );
}
