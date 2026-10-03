"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Brain,
  BriefcaseBusiness,
  Calculator,
  ClipboardCheck,
  Compass,
  FileSpreadsheet,
  FlaskConical,
  Gem,
  Gauge,
  Lightbulb,
  LineChart,
  ListChecks,
  LogOut,
  MoreHorizontal,
  Newspaper,
  Presentation,
  Search,
  Settings,
  Shield,
  TrendingUp
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DemoModeBanner } from "@/components/layout/demo-mode-banner";
import { SampleBanner, SampleMark } from "@/features/sample/sample-banner";
import { hiddenNavHrefs } from "@/lib/nav-visibility";
import { InstallAppPrompt } from "@/components/pwa/install-app-prompt";
import { apiFetch } from "@/lib/api/client";
import { DEMO_MODE } from "@/lib/demo";
import { brand } from "@/lib/brand";
import { rememberLocale } from "@/lib/i18n/locale-cookie";
import { localeConfig, type Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

type ShellUser = { name: string; email: string };
type Messages = Parameters<typeof t>[0];

type AppShellProps = {
  locale: Locale;
  messages: Messages;
  canAccessAdmin: boolean;
  /** The signed-in user, or null for a visitor: a visitor gets the public site frame, a user the workspace. */
  user: ShellUser | null;
  children: React.ReactNode;
};

type NavItem = {
  href: string;
  key: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

const homeItem: NavItem = { href: "dashboard", key: "nav.dashboard", icon: Gauge };

/** Platform faces only: no web font in it, so drawing a word with it never downloads one. */
const SYSTEM_FONT_STACK = '"Segoe UI", system-ui, Tahoma, sans-serif';

/** The workspace menu, grouped by what the trader is doing; the core loop (trading, analysis, system) comes first. */
const navGroups: { key: string; items: NavItem[] }[] = [
  {
    key: "nav.groups.trading",
    items: [
      { href: "plans", key: "nav.plans", icon: ClipboardCheck },
      { href: "journal", key: "nav.journal", icon: ListChecks },
      { href: "import", key: "nav.import", icon: FileSpreadsheet }
    ]
  },
  {
    key: "nav.groups.analysis",
    items: [
      { href: "performance", key: "nav.performance", icon: TrendingUp },
      { href: "reviews", key: "nav.reviews", icon: BarChart3 },
      { href: "ai", key: "nav.ai", icon: Bot }
    ]
  },
  {
    key: "nav.groups.system",
    items: [
      { href: "strategies", key: "nav.strategies", icon: LineChart },
      { href: "risk", key: "nav.risk", icon: Calculator },
      { href: "backtests", key: "nav.backtests", icon: FlaskConical }
    ]
  },
  {
    key: "nav.groups.tools",
    items: [
      { href: "watchlists", key: "nav.watchlists", icon: Search },
      { href: "alerts", key: "nav.alerts", icon: AlertTriangle },
      { href: "ideas", key: "nav.ideas", icon: Lightbulb },
      { href: "portfolio", key: "nav.portfolio", icon: BriefcaseBusiness },
      { href: "learning", key: "nav.learning", icon: Brain },
      { href: "news", key: "nav.news", icon: Newspaper }
    ]
  },
  {
    key: "nav.groups.account",
    items: [
      { href: "settings", key: "nav.settings", icon: Settings },
      { href: "onboarding", key: "nav.onboarding", icon: Compass },
      { href: "billing", key: "nav.upgrade", icon: Gem },
      { href: "demo", key: "nav.demo", icon: Presentation },
      { href: "admin", key: "nav.admin", icon: Shield, adminOnly: true }
    ]
  }
];

/** The phone's bottom bar: the daily loop. Everything else is in the header's More menu. */
const bottomItems: NavItem[] = [
  homeItem,
  { href: "plans", key: "nav.plans", icon: ClipboardCheck },
  { href: "journal", key: "nav.journal", icon: ListChecks },
  { href: "reviews", key: "nav.reviews", icon: BarChart3 },
  { href: "ai", key: "nav.ai", icon: Bot }
];

/** The same page in the other language: /fa/journal -> /en/journal. */
function samePageIn(pathname: string | null, locale: Locale, target: Locale) {
  if (!pathname?.startsWith(`/${locale}`)) return `/${target}/dashboard`;
  return `/${target}${pathname.slice(locale.length + 1)}`;
}

export function AppShell({ locale, messages, canAccessAdmin, user, children }: AppShellProps) {
  return user ? (
    <WorkspaceShell locale={locale} messages={messages} canAccessAdmin={canAccessAdmin} user={user}>
      {children}
    </WorkspaceShell>
  ) : (
    <PublicShell locale={locale} messages={messages}>
      {children}
    </PublicShell>
  );
}

/** The first thing a keyboard user can reach: it jumps past the header and the 18+ sidebar links to <main id="content">. */
function SkipLink({ messages }: { messages: Messages }) {
  return (
    <a
      href="#content"
      className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-primary-foreground"
    >
      {t(messages, "nav.skipToContent")}
    </a>
  );
}

/** A plain anchor on purpose: the root layout writes <html lang dir> per document, so a language change must load the page afresh. */
function LanguageSwitch({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const alternateLocale = locale === "en" ? "fa" : "en";
  return (
    <a
      href={samePageIn(pathname, locale, alternateLocale)}
      onClick={() => rememberLocale(alternateLocale)}
      // The Persian label is the one Persian word on every English page. Where the platform's UI face has no Arabic
      // glyphs (Android Roboto, Chrome on macOS and Linux) the browser walks the page's font stack for them and would
      // reach the Vazirmatn @font-face, fetching the 111 KB file on every English page for one word. This stack leaves
      // it out: the glyphs come from a system face (Segoe UI, Tahoma or the platform's own Arabic fallback).
      style={alternateLocale === "fa" ? { fontFamily: SYSTEM_FONT_STACK } : undefined}
      className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {localeConfig[alternateLocale].label}
    </a>
  );
}

/** The public site: a short menu about the product, sign-in, and a start button. No workspace navigation. */
function PublicShell({ locale, messages, children }: { locale: Locale; messages: Messages; children: React.ReactNode }) {
  // The landing renders its #access section only outside demo mode (a demo build has the walkthrough instead), so
  // the menu must not link to an anchor that is not there.
  const sections = [
    { href: `/${locale}#how`, key: "nav.public.how" },
    { href: `/${locale}#features`, key: "nav.public.features" },
    ...(DEMO_MODE ? [] : [{ href: `/${locale}#access`, key: "nav.public.access" }])
  ];
  const startHref = DEMO_MODE ? `/${locale}/demo` : `/${locale}#access`;

  return (
    <div className={cn("flex min-h-screen flex-col bg-background", localeConfig[locale].dir === "rtl" ? "dir-rtl" : "dir-ltr")}>
      <SkipLink messages={messages} />
      <header className="sticky top-0 z-20 border-b border-border bg-background/92 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href={`/${locale}`} className="flex min-w-0 items-center gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Activity className="size-5" aria-hidden="true" />
            </span>
            {/* Up to 350px the three buttons leave too little room for the name: the icon stays, the name stays for
                screen readers. Measured with this header (2026-10-03): "Nazm" is 44px wide and fits from 340px up (at
                320px it was cut to 38px); «نظم» is 26px and fits at 320px; the page never scrolled sideways. 350 leaves
                10px for the few pixels another platform's UI face (Roboto, San Francisco) can add, and `truncate` ends
                the name in an ellipsis rather than pushing a button off the screen if a face is wider still. The rule
                was 440px for the product's former, much longer name. */}
            <span className="truncate text-base font-bold max-[350px]:sr-only">{brand[locale].name}</span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex" aria-label={t(messages, "nav.primary")}>
            {sections.map((section) => (
              <Link key={section.href} href={section.href} className="hover:text-foreground">
                {t(messages, section.key)}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <LanguageSwitch locale={locale} />
            <Link
              href={`/${locale}/login`}
              className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm font-semibold text-foreground hover:bg-muted"
            >
              {t(messages, "auth.signIn")}
            </Link>
            {/* Sign-up needs an invite code, so the start button explains access before any form. It is the page's one
                call to action, so it shows at every width (tighter padding on phones keeps 360px from overflowing). */}
            <Link
              href={startHref}
              className="inline-flex min-h-11 items-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:px-4"
            >
              {t(messages, "nav.public.start")}
            </Link>
          </div>
        </div>
      </header>

      <main id="content" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
        <div className="mx-auto max-w-[1180px] px-4 pt-4 sm:px-6">
          <DemoModeBanner locale={locale} />
        </div>
        <div className="mx-auto max-w-[1180px] px-4 pb-12 sm:px-6">{children}</div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-start md:justify-between">
          <p className="max-w-xl leading-7">{t(messages, "app.safetyCopy")}</p>
          <nav className="flex shrink-0 flex-wrap gap-x-6 gap-y-2" aria-label={t(messages, "nav.public.legal")}>
            <Link href={`/${locale}/terms`} className="hover:text-foreground">
              {t(messages, "nav.public.terms")}
            </Link>
            <Link href={`/${locale}/privacy`} className="hover:text-foreground">
              {t(messages, "nav.public.privacy")}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function WorkspaceShell({ locale, messages, canAccessAdmin, user, children }: AppShellProps & { user: ShellUser }) {
  const pathname = usePathname();
  const hidden = hiddenNavHrefs();
  const groups = navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => (!item.adminOnly || canAccessAdmin) && !hidden.has(item.href)) }))
    .filter((group) => group.items.length > 0);
  const isActive = (item: NavItem) => pathname === `/${locale}/${item.href}`;

  // The shell stays mounted while the user navigates, so the phone's More menu is closed whenever the page changes
  // (state adjusted during render, the pattern React recommends over an effect).
  const currentPath = pathname ?? "";
  const [shownPath, setShownPath] = useState(currentPath);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  if (shownPath !== currentPath) {
    setShownPath(currentPath);
    setMobileMoreOpen(false);
  }
  const [pageKey, setPageKey] = useState(0);
  const refetchPage = useCallback(() => setPageKey((key) => key + 1), []);
  // The strip above the page scrolls away with it; while sample data is loaded the sticky header keeps a small mark.
  const [sampleActive, setSampleActive] = useState(false);
  const mobileMoreRef = useRef<HTMLDetailsElement>(null);
  const mobileMoreSummaryRef = useRef<HTMLElement>(null);
  const sidebarNavRef = useRef<HTMLElement>(null);

  // On a laptop-height screen the Tools and Account groups sit below the sidebar's own scroll, so the page being
  // shown (Settings, usually) would be out of sight. Bring its link into view; "nearest" moves nothing if it is visible.
  useEffect(() => {
    const current = sidebarNavRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (typeof current?.scrollIntoView === "function") current.scrollIntoView({ block: "nearest" });
  }, [currentPath]);

  useEffect(() => {
    if (!mobileMoreOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileMoreOpen(false);
      // The focused link is about to disappear with the panel: hand focus back to the button that opened it, so a
      // keyboard user does not fall to <body>. (A tap outside moves focus on its own, so it is left alone.)
      mobileMoreSummaryRef.current?.focus();
    };
    const onPointerDown = (event: Event) => {
      if (!mobileMoreRef.current?.contains(event.target as Node)) setMobileMoreOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [mobileMoreOpen]);

  return (
    <div className={cn("min-h-screen bg-background", localeConfig[locale].dir === "rtl" ? "dir-rtl" : "dir-ltr")}>
      <SkipLink messages={messages} />
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[268px_1fr]">
        <aside className="hidden border-e border-border bg-card/80 backdrop-blur lg:block">
          <div className="sticky top-0 flex h-screen flex-col px-4 py-5">
            <Brand locale={locale} messages={messages} />
            {/* ps-1: this is a scroll box, and it clips the 2px focus outline (plus 2px offset) of a link on its start edge. */}
            <nav ref={sidebarNavRef} className="-me-2 mt-6 flex-1 overflow-y-auto ps-1 pe-2" aria-label={t(messages, "nav.primary")}>
              <NavLink item={homeItem} locale={locale} messages={messages} active={isActive(homeItem)} />
              {groups.map((group) => (
                <NavGroup key={group.key} label={t(messages, group.key)}>
                  {group.items.map((item) => (
                    <NavLink key={item.href} item={item} locale={locale} messages={messages} active={isActive(item)} />
                  ))}
                </NavGroup>
              ))}
            </nav>

            <div className="mt-4 rounded-md border border-warning/25 bg-warning/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{t(messages, "app.safetyTitle")}</span>
                <Badge tone="warning">{t(messages, "app.educational")}</Badge>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{t(messages, "app.safetyCopy")}</p>
            </div>
          </div>
        </aside>

        <main id="content" tabIndex={-1} className="min-w-0 pb-[calc(7rem+env(safe-area-inset-bottom))] focus:outline-none lg:pb-0">
          <header className="sticky top-0 z-20 border-b border-border bg-background/92 px-4 py-3 backdrop-blur sm:px-6">
            <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3 lg:hidden">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Activity className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  {/* Up to md the mark takes the subtitle's line, so the header stays one row high on a phone. */}
                  {sampleActive ? <SampleMark locale={locale} className="md:hidden" /> : null}
                  <p className={cn("truncate text-xs text-muted-foreground", sampleActive && "max-md:hidden")}>{t(messages, "app.subtitle")}</p>
                  <p className="truncate text-sm font-semibold">{brand[locale].name}</p>
                </div>
              </div>
              <div className="hidden lg:block">
                <p className="text-xs text-muted-foreground">{t(messages, "app.workspace")}</p>
                <p className="text-lg font-semibold">{t(messages, "app.title")}</p>
              </div>

              <div className="flex items-center gap-2">
                <details ref={mobileMoreRef} className="group relative lg:hidden" open={mobileMoreOpen}>
                  <summary
                    ref={mobileMoreSummaryRef}
                    className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={t(messages, "nav.more")}
                    onClick={(event) => {
                      // React owns `open`; the browser's own toggle is suppressed so the two cannot disagree.
                      event.preventDefault();
                      setMobileMoreOpen(!mobileMoreOpen);
                    }}
                  >
                    <MoreHorizontal className="size-4" aria-hidden="true" />
                    <span className="hidden sm:inline">{t(messages, "nav.more")}</span>
                  </summary>
                  {/* Anchored to the screen, not to the button (which is not at the screen edge, so a panel hung from
                      it ran off the page). The header's backdrop blur makes the header the containing block, and the
                      header spans the full width, so inset-x-4 is a 16px gutter on both sides in either direction.
                      The panel lives in the header's stacking context (z-20) and the bottom bar is z-30, so z-50 does
                      not lift it over the bar: its height is capped to end above the bar instead. 9.5rem is the 4rem
                      top offset, the 4.5rem bar with its border, and a little air; the safe-area inset is the bar's own. */}
                  <div className="fixed inset-x-4 top-16 z-50 mx-auto max-h-[min(70vh,calc(100dvh-9.5rem-env(safe-area-inset-bottom)))] max-w-[21rem] overflow-y-auto rounded-md border border-border bg-card p-2 shadow-xl shadow-black/30">
                    <nav aria-label={t(messages, "nav.more")}>
                      {groups.map((group) => (
                        <NavGroup key={group.key} label={t(messages, group.key)} compact>
                          {group.items.map((item) => (
                            <NavLink
                              key={item.href}
                              item={item}
                              locale={locale}
                              messages={messages}
                              active={isActive(item)}
                              onNavigate={() => setMobileMoreOpen(false)}
                              compact
                            />
                          ))}
                        </NavGroup>
                      ))}
                    </nav>
                  </div>
                </details>
                {sampleActive ? <SampleMark locale={locale} className="hidden shrink-0 md:inline-flex" /> : null}
                <LanguageSwitch locale={locale} />
                <AccountControls locale={locale} messages={messages} user={user} />
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6">
            <DemoModeBanner locale={locale} />
            <SampleBanner locale={locale} onChanged={refetchPage} onActiveChange={setSampleActive} />
          </div>
          {/* The key changes when sample data was loaded or removed: the page mounts again and fetches its own data afresh. */}
          <div key={pageKey} className="mx-auto max-w-[1440px] px-4 pb-6 sm:px-6">
            {children}
          </div>
        </main>
      </div>

      <InstallAppPrompt locale={locale} />

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden"
        aria-label={t(messages, "nav.primary")}
      >
        <div className="grid grid-cols-5 gap-1">
          {bottomItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={`/${locale}/${item.href}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-[11px] text-muted-foreground transition",
                  active && "bg-primary/10 text-primary"
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                <span className="max-w-full truncate">{t(messages, item.key)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function Brand({ locale, messages }: { locale: Locale; messages: Messages }) {
  return (
    <Link href={`/${locale}/dashboard`} className="flex items-center gap-3 px-2">
      <span className="inline-flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/20">
        <Activity className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm text-muted-foreground">{t(messages, "app.subtitle")}</span>
        <span className="block truncate text-lg font-bold">{brand[locale].name}</span>
      </span>
    </Link>
  );
}

/** A labelled set of menu links ("Trading", "Analysis", ...). */
function NavGroup({ label, compact = false, children }: { label: string; compact?: boolean; children: React.ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className={compact ? "mb-2 last:mb-0" : "mt-4"}>
      <p id={id} className={cn("px-3 pb-1 text-xs font-semibold text-muted-foreground/80", compact && "px-2")}>
        {label}
      </p>
      <div className={compact ? "grid grid-cols-2 gap-1" : "grid gap-0.5"}>{children}</div>
    </div>
  );
}

function NavLink({
  item,
  locale,
  messages,
  active,
  compact = false,
  onNavigate
}: {
  item: NavItem;
  locale: Locale;
  messages: Messages;
  active: boolean;
  compact?: boolean;
  /** Called when the link is chosen, e.g. to close a menu that lists it. */
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={`/${locale}/${item.href}`}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-10 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground",
        compact && "min-h-11 px-2 text-xs",
        active && "bg-primary/10 font-semibold text-primary"
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{t(messages, item.key)}</span>
    </Link>
  );
}

function AccountControls({ locale, messages, user }: { locale: Locale; messages: Messages; user: ShellUser }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } finally {
      // Leave either way: a failed call means the session is already gone or the network dropped.
      router.push(`/${locale}/login`);
      router.refresh();
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="hidden max-w-[12rem] truncate text-sm text-muted-foreground sm:inline" title={user.email}>
        {user.name || user.email}
      </span>
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        aria-label={t(messages, "auth.signOut")}
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
      >
        <LogOut className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">{t(messages, "auth.signOut")}</span>
      </button>
    </div>
  );
}
