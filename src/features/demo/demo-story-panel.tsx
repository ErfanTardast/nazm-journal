"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { SectionPanel } from "@/components/ui/section-panel";
import { apiFetch } from "@/lib/api/client";
import type { Locale } from "@/lib/i18n/locales";

type DemoDay = { date: string; index: number; disciplineGrade: string; trades: unknown[]; mistakes: string[] };
type DemoStory = {
  days: DemoDay[];
  repeatedMistake: string;
  disciplineImproved: boolean;
  aiRefusalExample: { refused: boolean; reason: string };
  riskGuardExample: { blocked: boolean; reason: string };
  summary: { totalTrades: number; followedRate: number; firstGrade: string; finalGrade: string };
};

const copy = {
  en: {
    title: "Two-week story",
    subtitle: "A deterministic walkthrough: a repeated mistake fades as discipline improves.",
    trades: "Trades",
    followed: "Rules followed",
    gradeArc: "Grade",
    repeated: "Repeated early mistake",
    improved: "Discipline improved",
    aiRefused: "AI declined an entry-call",
    riskBlocked: "Risk guard stopped trading"
  },
  fa: {
    title: "روایت دو هفته‌ای",
    subtitle: "یک مرور قطعی: یک خطای تکراری با بهبود نظم محو می‌شود.",
    trades: "معاملات",
    followed: "قوانین رعایت‌شده",
    gradeArc: "نمره",
    repeated: "خطای تکراری ابتدایی",
    improved: "نظم بهتر شد",
    aiRefused: "هوش مصنوعی درخواست ورود را رد کرد",
    riskBlocked: "نگهبان ریسک معامله را متوقف کرد"
  }
};

/** Read-only demo narrative panel. Fetches the deterministic story; degrades to nothing on failure. */
export function DemoStoryPanel({ locale }: { locale: Locale }) {
  const c = copy[locale];
  const [story, setStory] = useState<DemoStory | null>(null);

  useEffect(() => {
    apiFetch<DemoStory>("/api/demo/story")
      .then(setStory)
      .catch(() => setStory(null));
  }, []);

  if (!story) return null;
  const followedPct = Math.round(story.summary.followedRate * 100);

  return (
    <SectionPanel title={c.title} description={c.subtitle}>
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          <Badge tone="default">{c.trades}: {story.summary.totalTrades}</Badge>
          <Badge tone="default">{c.followed}: {followedPct}%</Badge>
          <Badge tone={story.disciplineImproved ? "success" : "default"}>
            {c.gradeArc}: {story.summary.firstGrade} → {story.summary.finalGrade}
          </Badge>
        </div>

        <ul className="grid gap-1 text-xs text-muted-foreground">
          <li>• {c.repeated}: {story.repeatedMistake}</li>
          {story.aiRefusalExample.refused ? <li>• {c.aiRefused}: {story.aiRefusalExample.reason}</li> : null}
          {story.riskGuardExample.blocked ? <li>• {c.riskBlocked}: {story.riskGuardExample.reason}</li> : null}
        </ul>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
          {story.days.map((d) => (
            <div key={d.date} className="rounded-md border border-border p-1" title={d.date}>
              <div className="font-medium text-foreground">{d.disciplineGrade}</div>
              <div className="text-muted-foreground">{d.trades.length}t</div>
              {d.mistakes.length > 0 ? <div className="text-warning">!</div> : <div>&nbsp;</div>}
            </div>
          ))}
        </div>
      </div>
    </SectionPanel>
  );
}
