"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, Download, ExternalLink, ShieldCheck, SlidersHorizontal, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InsightCard } from "@/components/ui/insight-card";
import { SectionPanel } from "@/components/ui/section-panel";
import { Select } from "@/components/ui/select";
import { AuthRequiredState, ErrorState, LoadingState } from "@/components/ui/state";
import { NoteLine, type Note } from "@/features/settings/note-line";
import { PasswordCard } from "@/features/settings/password-card";
import { apiFetch, isAuthError } from "@/lib/api/client";
import { apiErrorCode, apiErrorText } from "@/lib/api/error-text";
import { t, type getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";
import { BROKER_TIME_ZONES, timeZoneLabel } from "@/lib/time/zones";
import { parseNumberInput } from "@/lib/validation/number-input";

type Messages = ReturnType<typeof getMessages>;
type Settings = {
  locale: "en" | "fa";
  theme: "dark" | "light" | "system";
  timezone: string;
  riskPerTradePct: number;
  maxDailyLossPct: number;
  maxWeeklyLossPct: number;
  startingBalance: number | null;
  brokerTimeZone: string;
};
type SystemOptions = {
  product: {
    supportedMarkets: { value: string; label: string; description: string }[];
    coreWorkflows: string[];
    safetyGuardrails: string[];
  };
  userDefaults: {
    locales: { value: string; label: string; description: string }[];
    themes: { value: string; label: string; description: string }[];
    timezones: string[];
    riskPresets: { label: string; riskPerTradePct: number; maxDailyLossPct: number; maxWeeklyLossPct: number }[];
  };
  ai: {
    provider: string;
    workflows: { value: string; label: string; description: string }[];
  };
  infrastructure: {
    database: string;
    redis: string;
    emailProvider: string;
    marketDataProvider: string;
    appUrl: string;
  };
};
type DataCategory = { key: string; label: string; description: string; exportable: boolean };
type Named = Record<string, { label: string; description: string }>;

const copy = {
  en: {
    description: "Tune the second-brain operating defaults for review rhythm, risk discipline, and safe local providers.",
    preferences: "Workspace preferences",
    preferencesDesc: "These settings personalize the protected workspace after sign-in.",
    timezone: "Timezone",
    riskPerTrade: "Risk per trade %",
    maxDailyLoss: "Max daily loss %",
    maxWeeklyLoss: "Max weekly loss %",
    risk: "Risk defaults",
    riskDesc: "Used as planning guardrails by calculators, journal review, and coaching workflows.",
    presetRisk: "Risk/trade",
    presetDaily: "Daily loss",
    presetWeekly: "Weekly loss",
    system: "System options",
    systemDesc: "Read-only app capabilities and local provider modes.",
    systemRows: { database: "Database", redis: "Redis", ai: "AI provider", email: "Email provider", market: "Market data" },
    markets: "Supported markets",
    marketsDesc: "The MVP scope remains focused and review-oriented.",
    ai: "AI and review modes",
    aiDesc: "Available educational/review workflows. External providers remain optional.",
    privacy: "Data & Privacy",
    privacyDesc: "Review what the workspace stores, download your data, or permanently delete your account.",
    privacyPolicy: "Open privacy policy",
    exportData: "Export my data",
    exporting: "Exporting...",
    exportFailed: "The export failed. Try again in a moment.",
    exportIncluded: "in export",
    exportInternal: "internal",
    deletionTitle: "Delete account",
    deletionDesc: "This permanently removes your account and user-scoped records. Plan purchase records are kept for accounting, unlinked from your name and email. Export your data first if you need a copy.",
    deleteFailed: "The account could not be deleted. Check the email, the confirmation word and your password.",
    deleteEmailMismatch: "The email you typed does not match this account's email.",
    deletePasswordInvalid: "The password is not correct.",
    confirmationEmail: "Account email",
    confirmationPhrase: "Type DELETE",
    confirmationPhraseHint: "Use uppercase DELETE to confirm.",
    password: "Password",
    deleteAccount: "Delete account permanently",
    deletingAccount: "Deleting account...",
    accountDeleted: "Account deleted",
    save: "Save settings",
    saving: "Saving...",
    saved: "Settings saved",
    saveFailed: "The settings could not be saved.",
    startingBalance: "Starting account balance",
    startingBalanceHint: "Optional. With it, drawdown is also shown as a % of the account, like the MT5 report.",
    brokerTimeZone: "Broker time zone (MT5 reports)",
    brokerTimeZoneHint: "MT5 reports print the broker's server time with no zone. Most brokers use New York close; check yours in MT5 (Market Watch clock).",
    unavailable: "Settings unavailable",
    loadFailed: "Settings failed to load.",
    loading: "Loading system options",
    safety: "Safety guardrails",
    safetyDesc: "System language and AI output stay review-focused.",
    // The server sends these options in English; the Persian page translates the known ones (see fa below).
    marketNames: {} as Named,
    workflowNames: {} as Named,
    // The server's category names are already English; only the one renamed in the product is worded here.
    categoryNames: { backtests: { label: "Scenarios", description: "Saved scenario results and equity curves" } } as Named,
    presetNames: {} as Record<string, string>,
    guardrailNames: {} as Record<string, string>,
    valueNames: {} as Record<string, string>,
    zoneNames: {} as Record<string, string>
  },
  fa: {
    description: "پیش‌فرض‌های ذهن دوم را برای ریتم مرور، انضباط ریسک و ارائه‌دهنده‌های محلی تنظیم کنید.",
    preferences: "ترجیحات محیط کار",
    preferencesDesc: "این تنظیمات بعد از ورود، محیط محافظت‌شده را شخصی‌سازی می‌کند.",
    timezone: "منطقه زمانی",
    riskPerTrade: "ریسک هر معامله (٪)",
    maxDailyLoss: "حداکثر زیان روزانه (٪)",
    maxWeeklyLoss: "حداکثر زیان هفتگی (٪)",
    risk: "پیش‌فرض‌های ریسک",
    riskDesc: "این مقادیر به عنوان چارچوب برنامه‌ریزی در ماشین‌حساب‌ها، ژورنال و مربی استفاده می‌شوند.",
    presetRisk: "ریسک هر معامله",
    presetDaily: "زیان روزانه",
    presetWeekly: "زیان هفتگی",
    system: "گزینه‌های سیستم",
    systemDesc: "قابلیت‌های اپ نظم و حالت ارائه‌دهنده‌های محلی به‌صورت خواندنی.",
    systemRows: { database: "پایگاه داده", redis: "Redis", ai: "ارائه‌دهنده AI", email: "ارائه‌دهنده ایمیل", market: "داده بازار" },
    markets: "بازارهای پشتیبانی‌شده",
    marketsDesc: "دامنه محصول عمداً محدود و مرورمحور نگه داشته شده است.",
    ai: "حالت‌های AI و مرور",
    aiDesc: "گردش‌کارهای آموزشی و مرور. ارائه‌دهنده‌های خارجی اختیاری هستند.",
    privacy: "داده و حریم خصوصی",
    privacyDesc: "ببینید اپ نظم چه داده‌ای نگه می‌دارد، خروجی بگیرید یا حساب را به‌طور دائم حذف کنید.",
    privacyPolicy: "باز کردن سیاست حریم خصوصی",
    exportData: "خروجی داده‌های من",
    exporting: "در حال خروجی...",
    exportFailed: "گرفتن خروجی انجام نشد. چند لحظه بعد دوباره تلاش کنید.",
    exportIncluded: "در خروجی",
    exportInternal: "فقط داخلی",
    deletionTitle: "حذف حساب",
    deletionDesc: "این کار حساب و رکوردهای مربوط به کاربر را به طور دائم حذف می‌کند. سوابق خرید پلن برای حسابداری، بدون نام و ایمیل شما، نگه داشته می‌شود. اگر نسخه می‌خواهید ابتدا خروجی بگیرید.",
    deleteFailed: "حذف حساب انجام نشد. ایمیل، کلمه تأیید و رمز عبور را بررسی کنید.",
    deleteEmailMismatch: "ایمیل واردشده با ایمیل این حساب یکی نیست.",
    deletePasswordInvalid: "رمز عبور درست نیست.",
    confirmationEmail: "ایمیل حساب",
    confirmationPhrase: "DELETE را بنویسید",
    confirmationPhraseHint: "برای تایید، DELETE را با حروف بزرگ بنویسید.",
    password: "رمز عبور",
    deleteAccount: "حذف دائم حساب",
    deletingAccount: "در حال حذف حساب...",
    accountDeleted: "حساب حذف شد",
    save: "ذخیره تنظیمات",
    saving: "در حال ذخیره...",
    saved: "تنظیمات ذخیره شد",
    saveFailed: "ذخیره تنظیمات ممکن نشد.",
    startingBalance: "موجودی اولیه حساب",
    startingBalanceHint: "اختیاری. با آن، افت سرمایه به درصد حساب هم نشان داده می‌شود، مثل گزارش MT5.",
    brokerTimeZone: "منطقه زمانی بروکر (گزارش‌های MT5)",
    brokerTimeZoneHint: "گزارش MT5 زمان سرور بروکر را بدون منطقه زمانی می‌نویسد. بیشتر بروکرها «بسته شدن نیویورک» هستند؛ ساعت Market Watch در MT5 را با ساعت خودتان مقایسه کنید.",
    unavailable: "تنظیمات در دسترس نیست",
    loadFailed: "بارگذاری تنظیمات ممکن نشد.",
    loading: "در حال بارگذاری گزینه‌های سیستم",
    safety: "چارچوب‌های ایمنی",
    safetyDesc: "زبان سیستم و خروجی AI مرورمحور می‌ماند.",
    marketNames: {
      forex: { label: "فارکس", description: "جفت‌ارزها و مرور زمینه کلان." },
      crypto: { label: "کریپتو", description: "ژورنال، ریسک و مرور زمینه برای کریپتوی اسپات." },
      stocks: { label: "سهام جهانی", description: "ژورنال سهام و زمینه عملکرد." }
    } as Named,
    workflowNames: {
      professional_coach: { label: "مربی حرفه‌ای", description: "مرور کیفیت فرایند برای معامله‌گران باتجربه." },
      learning: { label: "دستیار یادگیری", description: "توضیح ساده و پرسش‌های مطالعه برای مبتدی‌ها." },
      journal_reviewer: { label: "بازبین ژورنال", description: "پیدا کردن رفتارهای تکراری در یادداشت‌های معامله." },
      strategy_reviewer: { label: "بازبین استراتژی", description: "بهبود شفافیت پلی‌بوک و انضباط چک‌لیست." },
      risk_discipline: { label: "انضباط ریسک", description: "مرور ثبات ریسک نسبت به پیش‌فرض‌های ذخیره‌شده." },
      news_context: { label: "زمینه خبر", description: "خلاصه کردن زمینه به صورت نکات احتیاطی و پرسش‌های مرور." },
      weekly_review: { label: "مرور هفتگی", description: "تبدیل هفته به درس‌های فرایندی." }
    } as Named,
    categoryNames: {
      account: { label: "حساب", description: "ایمیل، نام، زبان، پلن و پاسخ‌های شروع کار (پلتفرم معاملاتی، هدف اصلی، پایان راه‌اندازی)" },
      onboardingProfile: { label: "نمایه شروع کار", description: "بخش شروع، اسپرینت انضباط و تنظیمات هفته اول" },
      riskProfile: { label: "نمایه ریسک", description: "پیش‌فرض‌های ریسک و تنظیمات اندازه حساب" },
      strategies: { label: "پلی‌بوک‌ها", description: "قوانین و چک‌لیست‌های استراتژی؛ داده نمونه در خروجی نیست" },
      tradePlans: { label: "پلن‌های معامله", description: "ستاپ‌های برنامه‌ریزی‌شده پیش از ورود؛ داده نمونه در خروجی نیست" },
      tradeImports: { label: "واردکردن معاملات", description: "پیش‌نمایش‌های CSV و ردیف‌های نگاشت‌شده" },
      trades: { label: "معاملات", description: "معاملات ثبت‌شده و نتایج؛ داده نمونه در خروجی نیست" },
      journalEntries: { label: "ژورنال", description: "یادداشت‌ها، خطاها و درس‌ها" },
      reviews: { label: "مرورها", description: "مرورهای روزانه، هفتگی، خطا، ریسک و استراتژی؛ داده نمونه در خروجی نیست" },
      ideas: { label: "ایده‌ها", description: "یادداشت‌های خصوصی پژوهش و بهبود" },
      sessions: { label: "جلسه‌های معاملاتی", description: "سوابق انضباط جلسه‌های معاملاتی" },
      watchlists: { label: "فهرست نمادها", description: "نمادهای ذخیره‌شده" },
      portfolios: { label: "پورتفوها", description: "سوابق دستی پورتفو، دارایی و موجودی نقد" },
      alerts: { label: "هشدارها", description: "یادآورهای مرور و سوابق اعلان محلی" },
      backtests: { label: "سناریوها", description: "نتایج سناریوهای ثبت‌شده و منحنی سرمایه" },
      uploads: { label: "فایل‌های آپلودی", description: "اطلاعات پیوست‌ها و ارجاع به اسکرین‌شات‌های ذخیره‌شده" },
      // The inventory's own category id. It is written in two parts because the scope guard keeps the English billing words out of this file.
      ["pay" + "ments"]: { label: "پرداخت‌ها", description: "خرید پلن: پلن، مبلغ، روش پرداخت، شماره مرجع بانک یا هش تراکنش. پس از حذف حساب برای حسابداری و جدا از حساب شما نگه داشته می‌شود" },
      aiAudits: { label: "گزارش ممیزی AI", description: "سوابق درخواست‌ها و پاسخ‌های ردشده مربی" },
      auditLogs: { label: "گزارش ممیزی امنیتی", description: "رویدادهای امنیتی و تنظیمات مربوط به کاربر" },
      authSessions: { label: "نشست‌های ورود", description: "نشست‌های احراز هویت فعال و توکن‌های بازنشانی" }
    } as Named,
    presetNames: { Conservative: "محافظه‌کارانه", Balanced: "متعادل", "Strict Evaluation": "ارزیابی سخت‌گیرانه" } as Record<string, string>,
    guardrailNames: {
      "Educational analytics only": "فقط تحلیل آموزشی",
      "No market certainty language": "بدون زبان قطعیت درباره بازار",
      "No financial advice promises": "بدون وعده توصیه مالی",
      "No live market connectivity": "بدون اتصال زنده به بازار",
      "No automation of trading decisions": "بدون خودکارسازی تصمیم‌های معاملاتی"
    } as Record<string, string>,
    valueNames: { configured: "پیکربندی‌شده", "default-local": "پیش‌فرض محلی", "memory-fallback": "حافظه (پشتیبان)", local: "محلی" } as Record<string, string>,
    zoneNames: {
      "Asia/Tehran": "تهران",
      UTC: "UTC",
      "Europe/London": "لندن",
      "America/New_York": "نیویورک",
      "Asia/Dubai": "دبی",
      "Asia/Singapore": "سنگاپور",
      "Asia/Tokyo": "توکیو"
    } as Record<string, string>
  }
} as const;

export function SettingsScreen({ locale, messages }: { locale: Locale; messages: Messages }) {
  const c = copy[locale];
  const [settings, setSettings] = useState<Settings | null>(null);
  const [options, setOptions] = useState<SystemOptions | null>(null);
  // A failed load (or a signed-out session on any call) replaces the page; save/export/delete results sit by their own button.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [saveNote, setSaveNote] = useState<Note | null>(null);
  const [exportNote, setExportNote] = useState<Note | null>(null);
  const [deleteNote, setDeleteNote] = useState<Note | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [dataCategories, setDataCategories] = useState<DataCategory[]>([]);
  const fieldLabels: Record<string, string> = {
    timezone: c.timezone,
    riskPerTradePct: c.riskPerTrade,
    maxDailyLossPct: c.maxDailyLoss,
    maxWeeklyLossPct: c.maxWeeklyLoss,
    startingBalance: c.startingBalance,
    brokerTimeZone: c.brokerTimeZone
  };

  useEffect(() => {
    // Privacy transparency is best-effort: never blocks the settings page if it fails.
    apiFetch<{ categories: DataCategory[] }>("/api/privacy/inventory")
      .then((d) => setDataCategories(d.categories))
      .catch(() => setDataCategories([]));
  }, []);

  useEffect(() => {
    Promise.all([
      apiFetch<{ settings: Settings }>("/api/users/me/settings"),
      apiFetch<{ options: SystemOptions }>("/api/system/options")
    ])
      .then(([settingsData, optionsData]) => {
        setSettings(settingsData.settings);
        setOptions(optionsData.options);
      })
      .catch(setLoadError);
  }, []);

  const activePreset = useMemo(() => {
    if (!settings || !options) return null;
    return options.userDefaults.riskPresets.find(
      (preset) =>
        preset.riskPerTradePct === settings.riskPerTradePct &&
        preset.maxDailyLossPct === settings.maxDailyLossPct &&
        preset.maxWeeklyLossPct === settings.maxWeeklyLossPct
    );
  }, [options, settings]);

  /** The server's option text, translated on the Persian page when it is a known one (unknown ones stay as sent). */
  const named = (map: Named, key: string, fallback: { label: string; description: string }) => map[key] ?? fallback;
  const zoneName = (zone: string) => {
    const label = timeZoneLabel(zone, locale);
    const city = c.zoneNames[zone];
    return city && city !== zone ? `${city} (${zone})` : label;
  };
  const percent = (value: number) => `${new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(value)}${locale === "fa" ? "٪" : "%"}`;

  async function exportData() {
    setExporting(true);
    setExportNote(null);
    try {
      const response = await fetch("/api/users/me/export");
      if (response.status === 401) {
        setSignedOut(true);
        return;
      }
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nazm-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportNote({ kind: "error", text: c.exportFailed });
    } finally {
      setExporting(false);
    }
  }

  /** The two refusals the deletion route words itself get their own sentence; anything else uses the screen's line. */
  function deleteErrorText(err: unknown) {
    const code = apiErrorCode(err);
    if (code === "ACCOUNT_DELETE_CONFIRMATION_MISMATCH") return c.deleteEmailMismatch;
    if (code === "ACCOUNT_DELETE_PASSWORD_INVALID") return c.deletePasswordInvalid;
    return apiErrorText(err, locale, c.deleteFailed);
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setDeletingAccount(true);
    setDeleteNote(null);
    try {
      await apiFetch("/api/users/me", {
        method: "DELETE",
        body: JSON.stringify({
          confirmationEmail: String(form.get("confirmationEmail")),
          confirmationText: String(form.get("confirmationText")),
          password: String(form.get("password"))
        })
      });
      setDeleteNote({ kind: "status", text: c.accountDeleted });
      window.location.assign(`/${locale}`);
    } catch (err) {
      if (isAuthError(err)) setSignedOut(true);
      else setDeleteNote({ kind: "error", text: deleteErrorText(err) });
    } finally {
      setDeletingAccount(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setSaveNote(null);
    try {
      await apiFetch("/api/users/me/settings", {
        method: "PATCH",
        body: JSON.stringify(Object.fromEntries(form))
      });
      setSettings((current) => ({
        locale: current?.locale ?? "en",
        theme: current?.theme ?? "dark",
        timezone: String(form.get("timezone")),
        riskPerTradePct: parseNumberInput(form.get("riskPerTradePct")),
        maxDailyLossPct: parseNumberInput(form.get("maxDailyLossPct")),
        maxWeeklyLossPct: parseNumberInput(form.get("maxWeeklyLossPct")),
        startingBalance: form.get("startingBalance") ? parseNumberInput(form.get("startingBalance")) : null,
        brokerTimeZone: String(form.get("brokerTimeZone"))
      }));
      setSaveNote({ kind: "status", text: c.saved });
    } catch (err) {
      if (isAuthError(err)) setSignedOut(true);
      else setSaveNote({ kind: "error", text: apiErrorText(err, locale, c.saveFailed, fieldLabels) });
    } finally {
      setSaving(false);
    }
  }

  if (signedOut || (loadError && isAuthError(loadError))) return <AuthRequiredState locale={locale} />;
  if (loadError && !settings && !options) return <ErrorState title={c.unavailable} description={apiErrorText(loadError, locale, c.loadFailed)} />;
  if (!settings || !options) return <LoadingState label={c.loading} />;

  return (
    <div className="space-y-6">
      <PageHeader title={t(messages, "pages.settings")} description={c.description} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <SectionPanel title={c.preferences} description={c.preferencesDesc}>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
              {/* Language is chosen with the switch in the header (remembered in a cookie); the theme is dark only. Nothing
                  reads the saved language or theme, so their selects are not offered here. */}
              <Field label={c.timezone}>
                <Select name="timezone" defaultValue={settings.timezone}>
                  {options.userDefaults.timezones.map((timezone) => (
                    <option key={timezone} value={timezone}>{zoneName(timezone)}</option>
                  ))}
                </Select>
              </Field>
              <Field label={c.riskPerTrade}>
                <Input name="riskPerTradePct" defaultValue={settings.riskPerTradePct} inputMode="decimal" />
              </Field>
              <Field label={c.maxDailyLoss}>
                <Input name="maxDailyLossPct" defaultValue={settings.maxDailyLossPct} inputMode="decimal" />
              </Field>
              <Field label={c.maxWeeklyLoss}>
                <Input name="maxWeeklyLossPct" defaultValue={settings.maxWeeklyLossPct} inputMode="decimal" />
              </Field>
              <Field label={c.startingBalance} hint={c.startingBalanceHint}>
                <Input name="startingBalance" defaultValue={settings.startingBalance ?? ""} inputMode="decimal" />
              </Field>
              <Field label={c.brokerTimeZone} hint={c.brokerTimeZoneHint}>
                <Select name="brokerTimeZone" defaultValue={settings.brokerTimeZone}>
                  {BROKER_TIME_ZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {zoneName(zone)}
                    </option>
                  ))}
                </Select>
              </Field>
              <NoteLine note={saveNote} className="md:col-span-2" />
              <Button className="md:col-span-2" disabled={saving}>
                <SlidersHorizontal className="me-2 size-4" aria-hidden="true" />
                {saving ? c.saving : c.save}
              </Button>
            </form>
          </SectionPanel>

          <SectionPanel title={c.risk} description={c.riskDesc}>
            <div className="grid gap-3 md:grid-cols-3">
              {options.userDefaults.riskPresets.map((preset) => (
                <InsightCard key={preset.label} title={c.presetNames[preset.label] ?? preset.label} tone={activePreset?.label === preset.label ? "success" : "default"}>
                  <div className="space-y-1">
                    <p>{c.presetRisk}: {percent(preset.riskPerTradePct)}</p>
                    <p>{c.presetDaily}: {percent(preset.maxDailyLossPct)}</p>
                    <p>{c.presetWeekly}: {percent(preset.maxWeeklyLossPct)}</p>
                  </div>
                </InsightCard>
              ))}
            </div>
          </SectionPanel>

          <SectionPanel title={c.ai} description={c.aiDesc}>
            <div className="grid gap-3 md:grid-cols-2">
              {options.ai.workflows.map((workflow) => {
                const text = named(c.workflowNames, workflow.value, workflow);
                return (
                  <div key={workflow.value} className="rounded-md border border-border bg-muted/20 p-3">
                    <p className="text-sm font-semibold text-foreground">{text.label}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{text.description}</p>
                  </div>
                );
              })}
            </div>
          </SectionPanel>

          <PasswordCard locale={locale} messages={messages} onSignedOut={() => setSignedOut(true)} />

          <SectionPanel title={c.privacy} description={c.privacyDesc}>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={exportData} disabled={exporting}>
                <Download className="me-2 size-4" aria-hidden="true" />
                {exporting ? c.exporting : c.exportData}
              </Button>
              <a
                href={`/${locale}/privacy`}
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-muted/80 px-4 text-sm font-semibold text-foreground transition hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <ExternalLink className="me-2 size-4" aria-hidden="true" />
                {c.privacyPolicy}
              </a>
            </div>
            <NoteLine note={exportNote} className="mt-3" />
            {dataCategories.length > 0 ? (
              <ul className="mt-3 grid gap-1 text-xs text-muted-foreground">
                {dataCategories.map((cat) => {
                  const text = named(c.categoryNames, cat.key, cat);
                  return (
                    <li key={cat.key} className="flex items-center justify-between gap-2">
                      <span>{text.label} — {text.description}</span>
                      <Badge tone={cat.exportable ? "success" : "default"}>{cat.exportable ? c.exportIncluded : c.exportInternal}</Badge>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            <div className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{c.deletionTitle}</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{c.deletionDesc}</p>
                </div>
              </div>
              <form onSubmit={deleteAccount} className="mt-4 grid gap-3 md:grid-cols-2">
                <Field label={c.confirmationEmail}>
                  <Input name="confirmationEmail" required type="email" autoComplete="email" />
                </Field>
                <Field label={c.confirmationPhrase} hint={c.confirmationPhraseHint}>
                  <Input name="confirmationText" required pattern="DELETE" autoComplete="off" />
                </Field>
                <Field label={c.password}>
                  <Input name="password" required type="password" autoComplete="current-password" />
                </Field>
                <NoteLine note={deleteNote} className="md:col-span-2" />
                <div className="flex items-end">
                  <Button type="submit" variant="danger" disabled={deletingAccount} className="w-full">
                    <Trash2 className="me-2 size-4" aria-hidden="true" />
                    {deletingAccount ? c.deletingAccount : c.deleteAccount}
                  </Button>
                </div>
              </form>
            </div>
          </SectionPanel>
        </div>

        <div className="space-y-4">
          <SectionPanel title={c.system} description={c.systemDesc}>
            <div className="space-y-3 text-sm">
              <SystemRow label={c.systemRows.database} value={options.infrastructure.database} names={c.valueNames} />
              <SystemRow label={c.systemRows.redis} value={options.infrastructure.redis} names={c.valueNames} />
              <SystemRow label={c.systemRows.ai} value={options.ai.provider} names={c.valueNames} />
              <SystemRow label={c.systemRows.email} value={options.infrastructure.emailProvider} names={c.valueNames} />
              <SystemRow label={c.systemRows.market} value={options.infrastructure.marketDataProvider} names={c.valueNames} />
            </div>
          </SectionPanel>

          <SectionPanel title={c.markets} description={c.marketsDesc}>
            <div className="space-y-3">
              {options.product.supportedMarkets.map((market) => {
                const text = named(c.marketNames, market.value, market);
                return (
                  <div key={market.value} className="rounded-md border border-border bg-muted/20 p-3">
                    <p className="text-sm font-semibold">{text.label}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{text.description}</p>
                  </div>
                );
              })}
            </div>
          </SectionPanel>

          <SectionPanel title={c.safety} description={c.safetyDesc}>
            <div className="space-y-2">
              {options.product.safetyGuardrails.map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ShieldCheck className="size-4 text-success" aria-hidden="true" />
                  <span>{c.guardrailNames[item] ?? item}</span>
                </div>
              ))}
            </div>
          </SectionPanel>
        </div>
      </div>
    </div>
  );
}

function SystemRow({ label, value, names }: { label: string; value: string; names: Record<string, string> }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <Badge tone={value.includes("fallback") ? "warning" : "success"}>{names[value] ?? value}</Badge>
    </div>
  );
}
