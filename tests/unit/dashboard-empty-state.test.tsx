import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import { englishLeaks } from "./support/english-leaks";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from "@/lib/api/client";
import { DashboardScreen } from "@/features/dashboard/dashboard-screen";

const messages = { en: getMessages("en"), fa: getMessages("fa") };

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

/** Answers by path (the query string is ignored), so a screen can ask in its own language. */
function serve(routes: Record<string, unknown>) {
  (apiFetch as Mock).mockImplementation(async (path: string) => {
    const key = path.split("?")[0];
    if (!(key in routes)) throw new Error(`Unexpected request ${path}`);
    return routes[key];
  });
}

const locales = ["en", "fa"] as const;

/*
 * Product audit item 11: a page with nothing on it says in one sentence what it is for, and points to the next step
 * (a link, or the form on the same page).
 */

describe("Dashboard for an account with no trades and no plans", () => {
  const overview = (extra: Record<string, unknown> = {}) => ({
    metrics: { totalTrades: 0, winRate: 0 },
    openTrades: 0,
    plannedTrades: [],
    repeatedMistakes: [],
    ruleViolations: 0,
    journalFollowUps: 0,
    completePlanCount: 0,
    riskDefaults: { riskPerTradePct: 1, maxDailyLossPct: 3, maxWeeklyLossPct: 6, valid: true },
    readiness: {
      status: "not_ready",
      score: 20,
      primaryAction: "plan",
      checks: ["plan", "risk", "review", "rules", "journal"].map((key) => ({ key, passed: false, count: 0 }))
    },
    reviewFocus: { review: null, overdueCount: 0, suggestedType: "daily" },
    activeSession: null,
    ...extra
  });
  const discipline = { disciplineScore: null, propGuard: { alerts: [], isBlocked: false, todayLossPct: 0, maxDailyLossPct: 3 }, mistakePatterns: [] };
  const streak = { currentStreak: 0, bestStreak: 0, totalActiveDays: 0, totalDisciplinedDays: 0, lastActiveDate: null, brokeStreakOnLastDay: false, unreviewedDays: 0 };
  const routes = (data: unknown) => ({ "/api/dashboard/overview": data, "/api/discipline": discipline, "/api/discipline/streak": streak });

  // The overview cannot tell "never had a plan" from "all plans closed", so the sentence only claims what it can see.
  const copy = {
    en: {
      sentence: "No trades logged and no active plan yet. Write a plan, or import the trades you already took.",
      plan: "Write a plan",
      importTrades: "Import trades",
      plainLine: /No active plan is ready/
    },
    fa: {
      sentence: "هنوز معامله‌ای ثبت نشده و پلن فعالی ندارید. یک پلن بنویسید یا معامله‌هایی را که قبلاً انجام داده‌اید وارد کنید.",
      plan: "نوشتن پلن",
      importTrades: "ورود معاملات",
      plainLine: /پلن فعالی آماده نیست/
    }
  } as const;

  it.each(locales)("shows one clear first step with links to write the first plan and to import trades (%s)", async (locale) => {
    serve(routes(overview()));
    const { container } = render(<DashboardScreen locale={locale} messages={messages[locale]} />);
    const sentence = await screen.findByText(copy[locale].sentence);
    const panel = sentence.parentElement as HTMLElement;
    expect(within(panel).getByRole("link", { name: copy[locale].plan }).getAttribute("href")).toBe(`/${locale}/plans`);
    expect(within(panel).getByRole("link", { name: copy[locale].importTrades }).getAttribute("href")).toBe(`/${locale}/import`);
    // It reuses the existing "no plan" slot: there is no second getting-started block.
    expect(screen.getAllByText(copy[locale].sentence)).toHaveLength(1);
    if (locale === "fa") expect(englishLeaks(container)).toEqual([]);
  });

  it.each(locales)("does not offer the import to an account that already has trades (%s)", async (locale) => {
    serve(routes(overview({ metrics: { totalTrades: 5, winRate: 0.4 } })));
    render(<DashboardScreen locale={locale} messages={messages[locale]} />);
    await screen.findByText(copy[locale].plainLine);
    expect(screen.queryByText(copy[locale].sentence)).toBeNull();
    expect(screen.queryByRole("link", { name: copy[locale].importTrades })).toBeNull();
    // Still one step: write a plan.
    expect(screen.getByRole("link", { name: copy[locale].plan }).getAttribute("href")).toBe(`/${locale}/plans`);
  });

  it.each(locales)("does not say there are no trades when one is still open (%s)", async (locale) => {
    // `totalTrades` counts closed trades only; the first trade is open and nothing is planned.
    serve(routes(overview({ openTrades: 1 })));
    render(<DashboardScreen locale={locale} messages={messages[locale]} />);
    await screen.findByText(copy[locale].plainLine);
    expect(screen.queryByText(copy[locale].sentence)).toBeNull();
    expect(screen.queryByRole("link", { name: copy[locale].importTrades })).toBeNull();
    expect(screen.getByRole("link", { name: copy[locale].plan }).getAttribute("href")).toBe(`/${locale}/plans`);
  });

  it.each(locales)("shows no first-step links once there is a plan (%s)", async (locale) => {
    const plan = { id: "p1", symbol: "EURUSD", market: "forex", bias: "x", status: "planned", invalidationRule: "y", riskPercent: 1 };
    serve(routes(overview({ plannedTrades: [plan], completePlanCount: 1 })));
    render(<DashboardScreen locale={locale} messages={messages[locale]} />);
    await screen.findByText("EURUSD");
    expect(screen.queryByRole("link", { name: copy[locale].plan })).toBeNull();
    expect(screen.queryByRole("link", { name: copy[locale].importTrades })).toBeNull();
  });
});
