"use client";

import { useEffect, useState } from "react";
import { Activity, Database, Flag, ShieldCheck, Workflow } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { InsightCard } from "@/components/ui/insight-card";
import { SectionPanel } from "@/components/ui/section-panel";
import { StatCard } from "@/components/ui/stat-card";
import { AuthRequiredState, ErrorState, LoadingState } from "@/components/ui/state";
import { apiFetch, isAuthError } from "@/lib/api/client";
import { formatDate } from "@/lib/i18n/format";
import { t, type getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";

type Messages = ReturnType<typeof getMessages>;
type AdminOverview = {
  counts: { users: number; trades: number; portfolios: number; alerts: number };
  featureFlags: { id: string; key: string; enabled: boolean; description: string | null }[];
  auditLogs: { id: string; action: string; entity: string; createdAt: string }[];
  system: {
    database: string;
    redis: string;
    aiProvider: string;
    emailProvider: string;
    marketDataProvider: string;
    appUrl: string;
  };
  options: {
    supportedMarkets: { value: string; label: string; description?: string }[];
    coreWorkflows: string[];
    safetyGuardrails: string[];
    aiWorkflows: { value: string; label: string; description?: string }[];
  };
};

const copy = {
  en: {
    description: "Operational overview for provider status, feature flags, audit logs, and second-brain guardrails.",
    loading: "Loading the admin overview",
    unavailable: "Admin overview unavailable",
    unavailableForbidden: "This page needs an admin account.",
    unavailableNetwork: "Could not reach the server. Check your connection and reload the page.",
    unavailableOther: "The overview could not be loaded. Reload the page in a moment.",
    counts: { users: "Users", trades: "Trades", portfolios: "Capital contexts", alerts: "Alerts" },
    health: "System health",
    healthDesc: "Runtime configuration and local fallback visibility.",
    rows: { database: "Database", redis: "Redis", appUrl: "App URL" },
    providers: "Provider modes",
    providersDesc: "Which provider each part of the app is using.",
    providerNames: { ai: "AI", email: "Email", market: "Market data" },
    flags: "Feature flags",
    flagsDesc: "Feature flags stored in the database.",
    flagOn: "enabled",
    flagOff: "disabled",
    noFlags: "No feature flags configured.",
    workflows: "Enabled workflows",
    workflowsDesc: "Review-oriented modules available in this build.",
    guardrails: "Safety guardrails",
    guardrailsDesc: "Product language and AI safety constraints.",
    audit: "Audit log",
    auditDesc: "Sensitive system and account actions appear here.",
    auditEmptyTitle: "No audit logs",
    auditEmptyDesc: "Sensitive actions will appear here.",
    auditColumns: { action: "Action", entity: "Entity", createdAt: "Created" },
    // The server's own words are already English.
    valueNames: {} as Record<string, string>,
    workflowNames: {} as Record<string, string>,
    guardrailNames: {} as Record<string, string>
  },
  fa: {
    description: "نمای عملیاتی برای وضعیت ارائه‌دهنده‌ها، فلگ‌ها، لاگ‌های امنیتی و چارچوب‌های ذهن دوم.",
    loading: "در حال بارگذاری نمای مدیریت",
    unavailable: "نمای مدیریت در دسترس نیست",
    unavailableForbidden: "این صفحه فقط با حساب مدیر باز می‌شود.",
    unavailableNetwork: "اتصال به سرور برقرار نشد. اینترنت خود را بررسی کنید و صفحه را دوباره بارگذاری کنید.",
    unavailableOther: "بارگذاری نمای مدیریت ممکن نشد. کمی بعد صفحه را دوباره بارگذاری کنید.",
    counts: { users: "کاربران", trades: "معامله‌ها", portfolios: "حساب‌های سرمایه", alerts: "هشدارها" },
    health: "سلامت سیستم",
    healthDesc: "پیکربندی زمان اجرا و جاهایی که سیستم روی حالت پشتیبان محلی کار می‌کند.",
    rows: { database: "پایگاه داده", redis: "Redis", appUrl: "نشانی برنامه" },
    providers: "حالت ارائه‌دهنده‌ها",
    providersDesc: "هر بخش برنامه از کدام ارائه‌دهنده استفاده می‌کند.",
    providerNames: { ai: "AI", email: "ایمیل", market: "داده بازار" },
    flags: "فلگ‌های قابلیت",
    flagsDesc: "فلگ‌هایی که در پایگاه داده ذخیره شده‌اند.",
    flagOn: "فعال",
    flagOff: "غیرفعال",
    noFlags: "هیچ فلگی تنظیم نشده است.",
    workflows: "گردش‌کارهای فعال",
    workflowsDesc: "بخش‌های مرورمحوری که در این نسخه در دسترس‌اند.",
    guardrails: "چارچوب‌های ایمنی",
    guardrailsDesc: "محدودیت‌های زبان محصول و ایمنی AI.",
    audit: "لاگ امنیتی",
    auditDesc: "اقدام‌های حساس سیستم و حساب‌ها اینجا ثبت می‌شود.",
    auditEmptyTitle: "هنوز چیزی ثبت نشده است",
    auditEmptyDesc: "اقدام‌های حساس اینجا نمایش داده می‌شود.",
    auditColumns: { action: "اقدام", entity: "موجودیت", createdAt: "زمان ثبت" },
    valueNames: {
      configured: "پیکربندی‌شده",
      "default-local": "پیش‌فرض محلی",
      "memory-fallback": "حافظه (پشتیبان)",
      local: "محلی"
    } as Record<string, string>,
    workflowNames: {
      "Daily review": "مرور روزانه",
      "Trade planning": "نوشتن پلن معامله",
      "Trade journaling": "ژورنال معامله",
      "Risk check": "بررسی ریسک",
      "Performance review": "مرور عملکرد",
      "Strategy playbook review": "مرور پلی‌بوک استراتژی",
      "News/context review": "مرور خبر و زمینه",
      "Learning mode": "حالت یادگیری"
    } as Record<string, string>,
    guardrailNames: {
      "Educational analytics only": "فقط تحلیل آموزشی",
      "No market certainty language": "بدون زبان قطعیت درباره بازار",
      "No financial advice promises": "بدون وعده توصیه مالی",
      "No live market connectivity": "بدون اتصال زنده به بازار",
      "No automation of trading decisions": "بدون خودکارسازی تصمیم‌های معاملاتی"
    } as Record<string, string>
  }
} as const;

/**
 * The card for a signed-in user who is not an admin. The admin page shows it without asking the server (it knows who is
 * signed in), and the screen shows it when the server answers 403, so both read the same.
 */
export function AdminForbidden({ locale }: { locale: Locale }) {
  const c = copy[locale];
  return <ErrorState title={c.unavailable} description={c.unavailableForbidden} />;
}

/** `children` are shown first, right under the heading, once the overview has loaded for an admin. */
export function AdminScreen({ locale, messages, children }: { locale: Locale; messages: Messages; children?: React.ReactNode }) {
  const c = copy[locale];
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    apiFetch<AdminOverview>("/api/admin/overview").then(setOverview).catch(setError);
  }, []);

  if (error) {
    if (isAuthError(error)) return <AuthRequiredState locale={locale} />;
    // The server's own sentence is English: the reason is worded here, by what kind of failure it was.
    const status = (error as { status?: unknown }).status;
    if (status === 403) return <AdminForbidden locale={locale} />;
    const reason = error instanceof TypeError ? c.unavailableNetwork : c.unavailableOther;
    return <ErrorState title={c.unavailable} description={reason} />;
  }
  if (!overview) return <LoadingState label={c.loading} />;

  const count = (value: number) => new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(value);
  /** A value the server names in English ("configured", "local"), in the page language; an unknown one is shown as stored. */
  const value = (raw: string) => c.valueNames[raw] ?? raw;

  return (
    <div className="space-y-6">
      <PageHeader title={t(messages, "pages.admin")} description={c.description} />
      {children}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label={c.counts.users} value={count(overview.counts.users)} />
        <StatCard label={c.counts.trades} value={count(overview.counts.trades)} />
        <StatCard label={c.counts.portfolios} value={count(overview.counts.portfolios)} />
        <StatCard label={c.counts.alerts} value={count(overview.counts.alerts)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionPanel title={c.health} description={c.healthDesc}>
          <div className="grid gap-3">
            <HealthRow icon={<Database className="size-4" />} label={c.rows.database} raw={overview.system.database} value={value(overview.system.database)} />
            <HealthRow icon={<Activity className="size-4" />} label={c.rows.redis} raw={overview.system.redis} value={value(overview.system.redis)} />
            <HealthRow icon={<Activity className="size-4" />} label={c.rows.appUrl} raw={overview.system.appUrl} value={overview.system.appUrl} stored />
          </div>
        </SectionPanel>

        <SectionPanel title={c.providers} description={c.providersDesc}>
          <div className="grid gap-3 sm:grid-cols-3">
            <InsightCard title={c.providerNames.ai} tone="success">{value(overview.system.aiProvider)}</InsightCard>
            <InsightCard title={c.providerNames.email} tone={overview.system.emailProvider === "local" ? "warning" : "success"}>{value(overview.system.emailProvider)}</InsightCard>
            <InsightCard title={c.providerNames.market} tone={overview.system.marketDataProvider === "local" ? "warning" : "success"}>{value(overview.system.marketDataProvider)}</InsightCard>
          </div>
        </SectionPanel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionPanel title={c.workflows} description={c.workflowsDesc}>
          <div className="space-y-2">
            {overview.options.coreWorkflows.map((workflow) => (
              <IconLine key={workflow} icon={<Workflow className="size-4 text-primary" />} label={c.workflowNames[workflow] ?? workflow} />
            ))}
          </div>
        </SectionPanel>

        <SectionPanel title={c.guardrails} description={c.guardrailsDesc}>
          <div className="space-y-2">
            {overview.options.safetyGuardrails.map((guardrail) => (
              <IconLine key={guardrail} icon={<ShieldCheck className="size-4 text-success" />} label={c.guardrailNames[guardrail] ?? guardrail} />
            ))}
          </div>
        </SectionPanel>

        <SectionPanel title={c.flags} description={c.flagsDesc}>
          <div className="space-y-2">
            {overview.featureFlags.length ? (
              overview.featureFlags.map((flag) => (
                <div key={flag.id} className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <code dir="ltr" className="text-sm font-semibold">{flag.key}</code>
                    <Badge tone={flag.enabled ? "success" : "default"}>{flag.enabled ? c.flagOn : c.flagOff}</Badge>
                  </div>
                  {flag.description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{flag.description}</p> : null}
                </div>
              ))
            ) : (
              <IconLine icon={<Flag className="size-4 text-muted-foreground" />} label={c.noFlags} />
            )}
          </div>
        </SectionPanel>
      </div>

      <SectionPanel title={c.audit} description={c.auditDesc}>
        <DataTable
          rows={overview.auditLogs}
          emptyTitle={c.auditEmptyTitle}
          emptyDescription={c.auditEmptyDesc}
          columns={[
            // Actions and entities are identifiers, shown as they are stored.
            { key: "action", header: c.auditColumns.action, cell: (row) => <code dir="ltr">{row.action}</code> },
            { key: "entity", header: c.auditColumns.entity, cell: (row) => <code dir="ltr">{row.entity}</code> },
            { key: "createdAt", header: c.auditColumns.createdAt, cell: (row) => formatDate(row.createdAt, locale) }
          ]}
        />
      </SectionPanel>
    </div>
  );
}

/** `raw` is the server's value (it decides the tone); `stored` marks a value shown as it is stored, left to right. */
function HealthRow({ icon, label, raw, value, stored = false }: { icon: React.ReactNode; label: string; raw: string; value: string; stored?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">{icon}{label}</span>
      <Badge tone={raw.includes("fallback") ? "warning" : "success"}>{stored ? <span dir="ltr">{value}</span> : value}</Badge>
    </div>
  );
}

function IconLine({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
      {icon}
      <span>{label}</span>
    </div>
  );
}
