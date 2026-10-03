import { useId } from "react";
import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/lib/i18n/locales";
import { limitSummaryLines } from "./limit-format";
import type { PlanStrategy } from "./strategy-link";

const copy = {
  en: {
    title: (name: string) => `Rules of strategy "${name}"`,
    readOnly: "Read-only here. The strategy's limits can be edited on the Strategies page.",
    sample: "Sample",
    entry: "Entry rules",
    invalidation: "Invalidation rules",
    risk: "Risk rules",
    limits: "Limits",
    noLimits: "No limits set",
    limitLabels: { riskPerTradePct: "Risk per trade", maxDailyLossPct: "Daily loss", maxOpenPositions: "Open positions" }
  },
  fa: {
    title: (name: string) => `قوانین استراتژی «${name}»`,
    readOnly: "در این صفحه فقط خواندنی است. سقف‌های استراتژی را می‌توانید در صفحه استراتژی‌ها ویرایش کنید.",
    sample: "نمونه",
    entry: "قوانین ورود",
    invalidation: "قوانین ابطال",
    risk: "قوانین ریسک",
    limits: "سقف‌ها",
    noLimits: "سقفی تعیین نشده",
    limitLabels: { riskPerTradePct: "ریسک هر معامله", maxDailyLossPct: "ضرر روزانه", maxOpenPositions: "پوزیشن باز" }
  }
} as const;

function RuleList({ title, rules }: { title: string; rules: string[] }) {
  if (rules.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold text-foreground">{title}</h4>
      <ul className="mt-1 list-disc space-y-0.5 ps-5 text-xs leading-5 text-muted-foreground">
        {rules.map((rule, index) => (
          <li key={`${index}:${rule}`}>{rule}</li>
        ))}
      </ul>
    </div>
  );
}

/** The chosen strategy's rules, next to the plan form. Nothing in it can be edited. */
export function StrategyRulesPanel({ strategy, locale }: { strategy: PlanStrategy; locale: Locale }) {
  const c = copy[locale];
  const headingId = useId();
  const limits = limitSummaryLines(strategy, c.limitLabels, locale);
  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
      <div>
        <h3 id={headingId} className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
          {c.title(strategy.name)}
          {strategy.isSample ? <Badge>{c.sample}</Badge> : null}
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{c.readOnly}</p>
      </div>
      <RuleList title={c.entry} rules={strategy.entryRules ?? []} />
      <RuleList title={c.invalidation} rules={strategy.invalidationRules ?? []} />
      <RuleList title={c.risk} rules={strategy.riskRules ?? []} />
      <div>
        <h4 className="text-xs font-semibold text-foreground">{c.limits}</h4>
        {limits.length > 0 ? (
          <ul className="mt-1 list-disc space-y-0.5 ps-5 text-xs leading-5 text-muted-foreground">
            {limits.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">{c.noLimits}</p>
        )}
      </div>
    </section>
  );
}
