import Link from "next/link";
import { ArrowRight, Brain, ClipboardCheck, FileCheck2, GraduationCap, LineChart, Newspaper, ShieldCheck, Target, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PremiumPanel } from "@/components/ui/premium-panel";
import { DemoStoryPanel } from "./demo-story-panel";
import type { getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";
import { brand } from "@/lib/brand";

type Messages = ReturnType<typeof getMessages>;

const copy = {
  en: {
    eyebrow: "Demo mode",
    title: "Demo walkthrough",
    headline: "Your trading second brain.",
    description: "A guided story for showing Nazm as a private trader growth workspace.",
    open: "Start in Command Center",
    sections: [
      ["What it is", "A bilingual second brain for planning, journaling, reviewing, learning, and improving."],
      ["Command Center", "Daily review focus, repeated mistakes, risk discipline, planned scenarios, and learning next steps."],
      ["Journal", "Structured trade notes with mistakes, emotions, lessons, confidence, and rule discipline."],
      ["Growth", "Long-term progress across reviews, rules, strategy consistency, and learning focus."],
      ["Reviews", "Daily, weekly, mistake, risk, and strategy review workflows with checklists."],
      ["Playbooks", "Strategies are professional playbooks, not automated systems."],
      ["Risk", "Scenario calculators and discipline prompts for pre-trade review."],
      ["Context", "News and market context framed as questions to review, not as instructions."],
      ["AI Coach", "AI helps identify patterns, causes, questions, and discipline actions."],
      ["Learning", "Education is tied back to journal behavior and review templates."]
    ],
    safety: "No order execution. No copied accounts. No profit promises. No market certainty."
  },
  fa: {
    eyebrow: "حالت نمایشی",
    title: "راهنمای نمایشی",
    headline: "ذهن دوم معاملاتی شما.",
    description: "روایت راهنما برای نمایش اپ نظم به‌عنوان محیط خصوصی رشد معامله‌گر.",
    open: "شروع از مرکز فرمان",
    sections: [
      ["چیست", "ذهن دوم دو زبانه برای برنامه‌ریزی، ژورنال، مرور، یادگیری و بهبود."],
      ["مرکز فرمان", "تمرکز مرور روزانه، خطاهای تکراری، انضباط ریسک، سناریوها و گام بعدی یادگیری."],
      ["ژورنال", "یادداشت ساختاریافته معامله همراه خطا، احساس، درس، اعتماد و پایبندی به قوانین."],
      ["رشد", "پیشرفت بلندمدت در مرورها، قوانین، ثبات استراتژی و تمرکز یادگیری."],
      ["مرورها", "گردش‌کار روزانه، هفتگی، خطا، ریسک و استراتژی همراه چک‌لیست."],
      ["پلی‌بوک‌ها", "استراتژی‌ها پلی‌بوک حرفه‌ای هستند، نه سیستم خودکار."],
      ["ریسک", "ماشین‌حساب سناریو و یادآور انضباط برای مرور پیش از معامله."],
      ["زمینه", "اخبار و زمینه بازار به شکل پرسش برای مرور، نه دستور."],
      ["مربی AI", "هوش مصنوعی الگو، علت، پرسش مرور و اقدام انضباطی پیشنهاد می‌کند."],
      ["یادگیری", "آموزش به رفتار ژورنال و قالب‌های مرور وصل می‌شود."]
    ],
    safety: "بدون ثبت سفارش. بدون کپی حساب. بدون وعده سود. بدون قطعیت بازار."
  }
} as const;

const icons = [Target, ClipboardCheck, Brain, TrendingUp, FileCheck2, LineChart, ShieldCheck, Newspaper, Brain, GraduationCap];

// The page's own words live in `copy`; `messages` stays in the props only because the route and the tests pass it.
export function DemoScreen({ locale }: { locale: Locale; messages?: Messages }) {
  const c = copy[locale];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={c.eyebrow}
        title={c.title}
        description={c.description}
        action={
          <Link href={`/${locale}/dashboard`} className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
            {c.open}
            <ArrowRight className="ms-2 size-4" aria-hidden="true" />
          </Link>
        }
      />

      <PremiumPanel glow className="tm-grid-surface p-6">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{brand[locale].name}</p>
          <h2 className="mt-3 text-3xl font-semibold sm:text-5xl">{c.headline}</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">{c.safety}</p>
        </div>
      </PremiumPanel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {c.sections.map(([title, body], index) => {
          const Icon = icons[index] ?? FileCheck2;
          return (
            <PremiumPanel key={title} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <Icon className="size-5 text-primary" aria-hidden="true" />
                <span className="text-xs font-semibold text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
              </div>
              <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{body}</p>
            </PremiumPanel>
          );
        })}
      </div>

      <DemoStoryPanel locale={locale} />
    </div>
  );
}
