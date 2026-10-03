"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthRequiredState } from "@/components/ui/state";
import { apiFetch, isAuthError } from "@/lib/api/client";
import { apiErrorText } from "@/lib/api/error-text";
import { t, type getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";

type Messages = ReturnType<typeof getMessages>;
type Glossary = { term: string; definition: string; example?: string; level: string; relatedTerms: string[] };
type Templates = { journalPrompt: string[]; weeklyReview: string[] };

const copy = {
  en: {
    description: "Beginner and intermediate learning support for metrics, journaling, strategy checklists, mistakes, and risk discipline.",
    glossary: "Glossary",
    templates: "Review Templates",
    journalPrompts: "Journal prompts",
    weeklyReview: "Weekly review",
    disclaimer: "Learning Mode explains concepts and review prompts. It does not provide market decisions or profit expectations.",
    loadFailed: "The learning content failed to load."
  },
  fa: {
    description: "راهنمای آموزشی سطح مبتدی و متوسط برای شاخص‌ها، ژورنال‌نویسی، چک‌لیست استراتژی، خطاها و انضباط ریسک.",
    glossary: "واژه‌نامه",
    templates: "قالب‌های مرور",
    journalPrompts: "پرسش‌های ژورنال",
    weeklyReview: "مرور هفتگی",
    disclaimer: "حالت یادگیری مفاهیم و پرسش‌های مرور را توضیح می‌دهد؛ تصمیم بازار یا انتظار سود ارائه نمی‌کند.",
    loadFailed: "بارگذاری محتوای یادگیری ممکن نشد."
  }
} as const;

export function LearningScreen({ locale, messages }: { locale: Locale; messages: Messages }) {
  const c = copy[locale];
  const [glossary, setGlossary] = useState<Glossary[]>([]);
  const [templates, setTemplates] = useState<Templates | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ glossary: Glossary[]; templates: Templates }>(`/api/learning/glossary?locale=${locale}`)
      .then((data) => {
        setGlossary(data.glossary);
        setTemplates(data.templates);
        setError(null);
      })
      .catch((err) => {
        if (isAuthError(err)) setAuthRequired(true);
        else setError(apiErrorText(err, locale, c.loadFailed));
      });
  }, [locale]);

  if (authRequired) return <AuthRequiredState locale={locale} />;

  return (
    <div className="space-y-6">
      <PageHeader title={t(messages, "pages.learning")} description={c.description} />
      {error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader><CardTitle>{c.glossary}</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            {glossary.map((item) => (
              <div key={item.term} className="rounded-md border border-border p-4">
                <p className="font-semibold">{item.term}</p>
                <p className="mt-2 text-sm text-muted-foreground">{item.definition}</p>
                {item.example ? <p className="mt-2 text-xs text-muted-foreground">{item.example}</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{c.templates}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Template title={c.journalPrompts} items={templates?.journalPrompt ?? []} />
            <Template title={c.weeklyReview} items={templates?.weeklyReview ?? []} />
            <p className="text-xs leading-5 text-muted-foreground">{c.disclaimer}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Template({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-sm font-semibold">{title}</p>
      <ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}
