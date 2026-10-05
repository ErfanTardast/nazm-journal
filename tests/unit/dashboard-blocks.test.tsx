import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import { buildPerformanceSnapshot } from "@/lib/calculations/performance";
import type { WeekFocus } from "@/lib/calculations/week-focus";
import { englishLeaks } from "./support/english-leaks";
import { latinDigitStrings } from "./support/latin-digits";
import { perfTrade } from "./support/performance-trades";

vi.mock("@/features/onboarding/setup-checklist", () => ({ SetupChecklist: () => null }));
vi.mock("@/features/sample/sample-data-offer", () => ({ SampleDataOffer: () => null }));
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from "@/lib/api/client";
import { DashboardScreen } from "@/features/dashboard/dashboard-screen";
import { focusSentence } from "@/features/dashboard/focus-card";

const messages = { en: getMessages("en"), fa: getMessages("fa") };
const locales = ["en", "fa"] as const;

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

const now = new Date("2026-10-04T10:00:00.000Z");

/** The 30-day snapshot of a few closed trades, built by the same code the server uses. */
function snapshot(over: { sample?: boolean; trades?: number } = {}) {
  const trades = Array.from({ length: over.trades ?? 3 }, (_, index) =>
    perfTrade({
      isSample: over.sample ?? false,
      openedAt: `2026-10-0${index + 1}T08:00:00.000Z`,
      closedAt: `2026-10-0${index + 1}T09:00:00.000Z`,
      realizedPnl: index === 1 ? -20 : 30,
      rMultiple: index === 1 ? -1 : 1.5,
      ruleFollowed: index === 0 ? "followed" : index === 1 ? "broken" : "unknown"
    })
  );
  return buildPerformanceSnapshot(trades, { period: "30d", now, timeZone: "Asia/Tehran", startingBalance: null });
}

const today = { day: "2026-10-04", closedToday: 2, netPnl: -21, netR: -2.1, basis: "r", lossPct: 2.1, limitPct: 3, usedShare: 0.7, state: "near", leftOut: 0, openTrades: 1, openRisk: 1, openWithoutRisk: 0 };

const baseOverview = {
  openTrades: 1,
  ruleViolations: 1,
  journalFollowUps: 0,
  riskDefaults: { riskPerTradePct: 1, maxDailyLossPct: 3, maxWeeklyLossPct: 6, valid: true },
  readiness: {
    status: "caution",
    score: 60,
    primaryAction: "review",
    checks: [
      { key: "plan", passed: true, count: 0 },
      { key: "risk", passed: true, count: 0 },
      { key: "review", passed: false, count: 1 },
      { key: "rules", passed: false, count: 1 },
      { key: "journal", passed: true, count: 0 }
    ]
  },
  reviewFocus: { review: { id: "r1", title: "مرور هفتگی", status: "open", periodEnd: "2026-10-06T00:00:00.000Z" }, overdueCount: 1, suggestedType: "weekly" },
  activeSession: null
};

const recentTrades = [
  { id: "t1", symbol: "EURUSD", side: "long", status: "closed", closedAt: "2026-10-03T10:00:00.000Z", realizedPnl: -12.5, rMultiple: -1, reviewed: false },
  { id: "t2", symbol: "BTCUSDT", side: "short", status: "closed", closedAt: "2026-10-02T10:00:00.000Z", realizedPnl: 40, rMultiple: 2, reviewed: true },
  { id: "t3", symbol: "EURUSD", side: "long", status: "open", closedAt: null, realizedPnl: null, rMultiple: null, reviewed: false }
];

const focus: WeekFocus = { kind: "mistake", label: "دیرهنگام وارد شدن", count: 3, totalR: -3, withoutR: 0 };

const full = (over: Record<string, unknown> = {}) => ({
  ...baseOverview,
  tradeCount: 12,
  today,
  performance: snapshot(),
  recentTrades,
  reviewTasks: { openCount: 2, overdueCount: 1, next: { id: "r1", title: "مرور هفتگی", type: "weekly", periodEnd: "2026-10-06T00:00:00.000Z" } },
  plans: {
    todayCount: 1,
    activeCount: 3,
    completeCount: 2,
    next: { id: "p1", symbol: "EURUSD", market: "forex", bias: "صعودی بالای حمایت", status: "planned", plannedFor: "2026-10-04T18:30:00.000Z", invalidationRule: "بسته شدن زیر حمایت", riskPercent: 1 }
  },
  focus,
  ...over
});

const discipline = { disciplineScore: { score: 82, grade: "B", checks: [{ key: "plan_adherence", score: 50, passed: false, detail: "" }] }, propGuard: { alerts: [], isBlocked: false, todayLossPct: 2.1, maxDailyLossPct: 3 }, mistakePatterns: [{ mistake: "ورود زودهنگام", frequency: 3, streak: 2, avgRImpact: -0.5 }] };
const streak = { currentStreak: 3, bestStreak: 5, totalActiveDays: 6, totalDisciplinedDays: 4, lastActiveDate: "2026-10-03", brokeStreakOnLastDay: false, unreviewedDays: 1 };

/** Serves the three requests the dashboard makes and throws on any other one: a new block must not ask for more. */
function serve(overview: unknown) {
  (apiFetch as Mock).mockImplementation(async (path: string) => {
    const key = path.split("?")[0];
    const routes: Record<string, unknown> = { "/api/dashboard/overview": overview, "/api/discipline": discipline, "/api/discipline/streak": streak };
    if (!(key in routes)) throw new Error(`Unexpected request ${path}`);
    return routes[key];
  });
}

async function renderScreen(locale: "en" | "fa", overview: unknown) {
  serve(overview);
  const view = render(<DashboardScreen locale={locale} messages={messages[locale]} />);
  await screen.findByTestId("discipline-streak-panel");
  return view;
}

const headings = (container: HTMLElement) => Array.from(container.querySelectorAll("h2")).map((heading) => heading.textContent ?? "");

describe("the dashboard answers three questions in order", () => {
  const titles = {
    en: ["Today", "Last 30 days", "This week's focus", "Recent trades", "Quick actions", "Today's readiness checks"],
    fa: ["امروز", "۳۰ روز اخیر", "تمرکز این هفته", "معاملات اخیر", "دسترسی سریع", "بررسی‌های آمادگی امروز"]
  } as const;

  it.each(locales)("orders the sections: readiness, today, 30 days, focus, recent trades, quick actions, then the checks (%s)", async (locale) => {
    const { container } = await renderScreen(locale, full());
    const shown = headings(container);
    const positions = titles[locale].map((title) => shown.indexOf(title));
    expect(positions.every((index) => index >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    // The readiness hero (an h2 with the status sentence) is first and the H1 stays.
    expect(shown[0]).toBe(locale === "en" ? "One or two checks need attention. Resolve the highest-priority item before adding a new record." : "یک یا دو مورد نیاز به توجه دارد. پیش از ثبت رکورد جدید، مهم‌ترین مورد را تکمیل کنید.");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(locale === "en" ? "Am I ready to trade today?" : "آیا امروز برای معامله آماده‌ام؟");
  });

  it("keeps the session panel, the discipline panel and the streak below the quick actions", async () => {
    const { container } = await renderScreen("en", full());
    const quick = screen.getByRole("heading", { name: "Quick actions" });
    for (const lower of [screen.getByText("No active session"), screen.getByText("Weekly discipline score"), screen.getByTestId("discipline-streak-panel")]) {
      expect(quick.compareDocumentPosition(lower) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(container.querySelectorAll("section[aria-labelledby]").length).toBe(5);
  });

  it("drops the four repeated stat cards, the repeated-mistakes list and the loop tiles", async () => {
    await renderScreen("en", full());
    for (const gone of ["Complete plans", "Overdue reviews", "Journal follow-ups", "Rule breaks, 7 days", "Repeated mistake evidence", "Plan → Journal → Review → Improve"]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
  });
});

describe("quick actions", () => {
  const expected = {
    en: [["Import MT5 trades", "import"], ["New plan", "plans"], ["Risk calculator", "risk"], ["Weekly review", "reviews"]],
    fa: [["ورود معاملات MT5", "import"], ["پلن جدید", "plans"], ["ماشین‌حساب ریسک", "risk"], ["مرور هفتگی", "reviews"]]
  } as const;

  it.each(locales)("links the four actions to their pages (%s)", async (locale) => {
    await renderScreen(locale, full());
    const section = screen.getByRole("heading", { name: locale === "en" ? "Quick actions" : "دسترسی سریع" }).closest("section") as HTMLElement;
    const links = within(section).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual(expected[locale].map(([label, page]) => [label, `/${locale}/${page}`]));
  });
});

describe("recent trades", () => {
  it.each(locales)("marks a trade without a rule verdict as not reviewed, and only that one (%s)", async (locale) => {
    const label = locale === "en" ? "Not reviewed" : "مرور نشده";
    const { container } = await renderScreen(locale, full());
    const row = (id: string) => container.querySelector(`[data-trade="${id}"]`) as HTMLElement;
    expect(within(row("t1")).getByText(label)).toBeInTheDocument();
    expect(within(row("t2")).queryByText(label)).toBeNull();
    expect(screen.getAllByText(label)).toHaveLength(recentTrades.filter((trade) => !trade.reviewed).length);
  });

  it("shows the result with its sign and R, the side and the close day, and links to the journal", async () => {
    const { container } = await renderScreen("en", full());
    const first = container.querySelector('[data-trade="t1"]') as HTMLElement;
    expect(first.textContent).toContain("EURUSD");
    expect(first.textContent).toContain("-$12.50");
    expect(first.textContent).toContain("-1.00R");
    expect(first.textContent).toContain("Long · Closed Oct 3");
    expect((container.querySelector('[data-trade="t3"]') as HTMLElement).textContent).toContain("No result yet");
    const section = screen.getByRole("heading", { name: "Recent trades" }).closest("section") as HTMLElement;
    expect(within(section).getByRole("link", { name: "Open the journal" }).getAttribute("href")).toBe("/en/journal");
  });

  it("says what to do when there are no trades", async () => {
    await renderScreen("en", full({ recentTrades: [] }));
    expect(screen.getByText(/No trades yet\. Import your MT5 report/)).toBeInTheDocument();
  });
});

describe("Today tiles", () => {
  it("shows the loss meter against the daily limit with its basis written out, and links to the journal", async () => {
    const { container } = await renderScreen("en", full());
    const tile = container.querySelector('[data-tile="risk"]') as HTMLElement;
    expect(tile.getAttribute("href")).toBe("/en/journal");
    expect(within(tile).getByText("Today's result")).toBeInTheDocument();
    expect(within(tile).getByText("Near the limit")).toBeInTheDocument();
    expect(within(tile).getByText("Loss 2.1% of the 3% daily loss limit")).toBeInTheDocument();
    expect(within(tile).getByText("Loss = the net R of the trades closed today (-2.10R) × your risk per trade (1%).")).toBeInTheDocument();
    expect(within(tile).getByText("2 trades closed today")).toBeInTheDocument();
    expect(within(tile).getByText(/1 trade open now; 1% of the account at risk, as stated on the trades/)).toBeInTheDocument();
    const meter = within(tile).getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuenow", "70");
    expect(meter).toHaveAttribute("aria-valuetext", "Loss 2.1% of the 3% daily loss limit");
  });

  it("says what a balance basis is, and what is left out", async () => {
    const balance = { ...today, basis: "balance", netPnl: -250, lossPct: 2.5, usedShare: 2.5 / 3, state: "near", leftOut: 1 };
    const { container } = await renderScreen("en", full({ today: balance }));
    const tile = container.querySelector('[data-tile="risk"]') as HTMLElement;
    expect(within(tile).getByText("Loss = the net result of the trades closed today (-$250.00) over your starting balance.")).toBeInTheDocument();
    expect(within(tile).getByText("1 without a money result, left out")).toBeInTheDocument();
  });

  it("tells the trader what to set when today cannot be measured, and points to Settings", async () => {
    const unknown = { ...today, basis: "none", state: "unknown", lossPct: 0, usedShare: 0, closedToday: 0, netPnl: 0, netR: 0, openTrades: 0, openRisk: null };
    const { container } = await renderScreen("en", full({ today: unknown }));
    const tile = container.querySelector('[data-tile="risk"]') as HTMLElement;
    expect(tile.getAttribute("href")).toBe("/en/settings");
    expect(within(tile).getByText("Not measured")).toBeInTheDocument();
    expect(within(tile).getByText("Set a starting balance or a risk per trade in Settings to measure today's loss.")).toBeInTheDocument();
    expect(within(tile).queryByRole("meter")).toBeNull();
  });

  it("shows a winning day as within the limit with the loss at zero", async () => {
    const win = { ...today, netPnl: 30, netR: 1.5, lossPct: 0, usedShare: 0, state: "clear", openTrades: 0, openRisk: null };
    const { container } = await renderScreen("en", full({ today: win }));
    const tile = container.querySelector('[data-tile="risk"]') as HTMLElement;
    expect(within(tile).getByText("Within the limit")).toBeInTheDocument();
    expect(within(tile).getByText("Loss 0% of the 3% daily loss limit")).toBeInTheDocument();
  });

  it("counts today's plans and names the next one, as a link to the plans", async () => {
    const { container } = await renderScreen("en", full());
    const tile = container.querySelector('[data-tile="plan"]') as HTMLElement;
    expect(tile.getAttribute("href")).toBe("/en/plans");
    expect(within(tile).getByText("1 plan for today")).toBeInTheDocument();
    expect(within(tile).getByText("3 active, 2 complete")).toBeInTheDocument();
    expect(within(tile).getByText("EURUSD")).toBeInTheDocument();
    expect(within(tile).getByText("Planned")).toBeInTheDocument();
    expect(within(tile).getByText(/Oct 4 · Risk 1%/)).toBeInTheDocument();
  });

  it("says no plan is dated today when plans exist for other days", async () => {
    const { container } = await renderScreen("en", full({ plans: { ...full().plans, todayCount: 0 } }));
    expect(within(container.querySelector('[data-tile="plan"]') as HTMLElement).getByText("No plan is dated today")).toBeInTheDocument();
  });

  it("labels the open and overdue review counts and the end of the next period, as a link to the reviews", async () => {
    const { container } = await renderScreen("en", full());
    const tile = container.querySelector('[data-tile="reviews"]') as HTMLElement;
    expect(tile.getAttribute("href")).toBe("/en/reviews");
    const counts = Array.from(tile.querySelectorAll("dl > div")).map((cell) => [cell.querySelector("dt")?.textContent, cell.querySelector("dd")?.textContent]);
    expect(counts).toEqual([["Open", "2"], ["Overdue", "1"]]);
    expect(within(tile).getByText("Period ends Oct 6")).toBeInTheDocument();
  });

  it("says so when no review is open", async () => {
    const { container } = await renderScreen("en", full({ reviewTasks: { openCount: 0, overdueCount: 0, next: null } }));
    expect(within(container.querySelector('[data-tile="reviews"]') as HTMLElement).getByText(/No open review/)).toBeInTheDocument();
  });

  it("names the zone the days are read in, with a link to change it", async () => {
    await renderScreen("en", full());
    expect(screen.getByText(/Days in your time zone:/).textContent).toContain("Asia/Tehran");
    expect(screen.getByRole("link", { name: "Change in Settings" }).getAttribute("href")).toBe("/en/settings");
  });
});

describe("Last 30 days", () => {
  it("labels each number with its period and says what it counts, with a link to Performance", async () => {
    const { container } = await renderScreen("en", full());
    const metric = (id: string) => container.querySelector(`[data-metric="${id}"]`) as HTMLElement;
    for (const id of ["net-pnl", "expectancy", "drawdown", "adherence"]) expect(within(metric(id)).getByText("30 days")).toBeInTheDocument();
    expect(within(metric("net-pnl")).getByText("Net P&L")).toBeInTheDocument();
    expect(metric("net-pnl").textContent).toContain("+$40.00");
    expect(metric("net-pnl").textContent).toContain("3 closed trades in the last 30 days, after fees");
    expect(within(metric("expectancy")).getByText("Expectancy")).toBeInTheDocument();
    expect(metric("expectancy").textContent).toContain("Average result per closed trade so far");
    expect(within(metric("drawdown")).getByText("Max drawdown")).toBeInTheDocument();
    expect(metric("adherence").textContent).toContain("50%");
    expect(metric("adherence").textContent).toContain("1 of 2 reviewed entries followed the rules; 1 not reviewed yet");
    expect(screen.getByRole("link", { name: "See the full report" }).getAttribute("href")).toBe("/en/performance");
  });

  it("notes a small sample factually", async () => {
    await renderScreen("en", full());
    expect(screen.getByText("Based on 3 entries; in a small sample each trade weighs heavily in these numbers.")).toBeInTheDocument();
  });

  it("marks every tile Sample data when the numbers come from the sample workspace", async () => {
    const { container } = await renderScreen("en", full({ performance: snapshot({ sample: true }) }));
    const section = screen.getByRole("heading", { name: "Last 30 days" }).closest("section") as HTMLElement;
    expect(within(section).getAllByText("Sample data")).toHaveLength(4);
    expect(container.querySelectorAll('[data-tile="risk"] .self-start').length).toBe(1);
  });

  it("does not mark own data as sample", async () => {
    await renderScreen("en", full());
    expect(screen.queryByText("Sample data")).toBeNull();
  });

  it("says what to do when no trade closed in the window", async () => {
    await renderScreen("en", full({ performance: snapshot({ trades: 0 }) }));
    expect(screen.getByText(/No trade closed in the last 30 days\. Import your MT5 report/)).toBeInTheDocument();
    expect(screen.queryByText("Net P&L")).toBeNull();
  });
});

describe("This week's focus", () => {
  it("states the finding with its count and R and links to the journal and the AI coach", async () => {
    await renderScreen("en", full({ focus: { kind: "reentry", count: 3, totalR: -3, withoutR: 0 } }));
    expect(screen.getByTestId("week-focus").textContent).toBe("Re-entry within 30 minutes after a loss: 3 times this week, -3.0R in total. Review these trades in the journal.");
    const section = screen.getByRole("heading", { name: "This week's focus" }).closest("section") as HTMLElement;
    expect(within(section).getByRole("link", { name: "Review in the journal" }).getAttribute("href")).toBe("/en/journal");
    expect(within(section).getByRole("link", { name: "Open AI Coach" }).getAttribute("href")).toBe("/en/ai");
    expect(within(section).getByText(/most negative total R/)).toBeInTheDocument();
  });

  it("says how many of the finding's trades have no R", async () => {
    await renderScreen("en", full({ focus: { kind: "rule_breaks", count: 2, totalR: -1, withoutR: 1 } }));
    expect(screen.getByText("1 of these have no R (no stop loss) and are left out of the total.")).toBeInTheDocument();
  });

  it.each(locales)("has a calm empty state when no pattern repeated (%s)", async (locale) => {
    await renderScreen(locale, full({ focus: null }));
    expect(screen.getByText(locale === "en" ? "No repeated pattern this week" : "این هفته الگوی تکراری‌ای دیده نشد")).toBeInTheDocument();
    expect(screen.queryByTestId("week-focus")).toBeNull();
  });
});

describe("focusSentence describes and invites a review, it never advises", () => {
  const findings: WeekFocus[] = [
    { kind: "mistake", label: "FOMO", count: 3, totalR: -3, withoutR: 0 },
    { kind: "rule_breaks", count: 1, totalR: -1.5, withoutR: 0 },
    { kind: "rule_breaks", count: 2, totalR: 0.5, withoutR: 1 },
    { kind: "reentry", count: 4, totalR: -2, withoutR: 0 }
  ];
  const advice = {
    en: /\b(should|must|stop|reduce|increase|avoid|recommend|signal|predict|will|best time)\b/i,
    fa: /باید|توصیه|سیگنال|پیش‌بینی|توقف|کاهش|افزایش|پرهیز/
  };

  it.each(locales)("uses no advice word in %s", (locale) => {
    for (const finding of findings) expect(focusSentence(finding, locale)).not.toMatch(advice[locale]);
  });

  it("writes the Persian sentence the product rules show, with Persian digits", () => {
    const sentence = focusSentence({ kind: "mistake", label: "دیرهنگام وارد شدن", count: 3, totalR: -3, withoutR: 0 }, "fa");
    expect(sentence.replace(/[‎⁦⁩]/g, "")).toBe("دیرهنگام وارد شدن: ۳ بار در این هفته، جمعاً −۳٫۰R. این معامله‌ها را در ژورنال مرور کنید.");
  });

  it("names a rule-break finding as the trader's own verdict word", () => {
    expect(focusSentence(findings[1], "fa")).toContain("«شکسته شد»");
    expect(focusSentence(findings[1], "en")).toContain("“rule broken”");
  });
});

describe("an older payload", () => {
  it.each(locales)("renders without the blocks it does not carry, and without crashing (%s)", async (locale) => {
    const older = {
      ...baseOverview,
      metrics: { totalTrades: 4, winRate: 0.5 },
      plannedTrades: [{ id: "p1", symbol: "EURUSD", market: "forex", bias: "x", status: "planned", invalidationRule: "y", riskPercent: 1 }],
      completePlanCount: 1,
      repeatedMistakes: ["ورود زودهنگام"]
    };
    const { container } = await renderScreen(locale, older);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByText("EURUSD")).toBeInTheDocument();
    const shown = headings(container);
    for (const title of locale === "en" ? ["Last 30 days", "This week's focus", "Recent trades"] : ["۳۰ روز اخیر", "تمرکز این هفته", "معاملات اخیر"]) expect(shown).not.toContain(title);
    expect(shown).toContain(locale === "en" ? "Quick actions" : "دسترسی سریع");
    expect(container.textContent).not.toContain("undefined");
    expect(container.textContent).not.toContain("NaN");
  });
});

describe("phone fit", () => {
  it("gives every link and button at least 44 px and the session inputs 16 px text", async () => {
    const { container } = await renderScreen("en", full());
    fireEvent.click(screen.getByRole("button", { name: "Start session" }));
    const controls = Array.from(container.querySelectorAll("a, button"));
    expect(controls.length).toBeGreaterThan(10);
    // Tile links carry the touch size on the tile, and a tile is a block of at least 44 px; text links and buttons carry it themselves.
    expect(controls.filter((control) => !/\bmin-h-(11|12)\b/.test(control.className))).toEqual([]);
    const fields = Array.from(container.querySelectorAll("form input, form select"));
    expect(fields.length).toBe(4);
    for (const field of fields) expect(field.className).toMatch(/\btext-base\b/);
  });
});

describe("Persian digits", () => {
  it("writes every number on the Persian dashboard in Persian digits and leaves no English", async () => {
    const { container } = await renderScreen("fa", full());
    expect(latinDigitStrings(container, [/Asia\/Tehran/g])).toEqual([]);
    expect(englishLeaks(container, [/Asia\/Tehran/g, /EURUSD|BTCUSDT/g])).toEqual([]);
    // The values are there, in Persian.
    expect(container.textContent).toContain("۳۰ روز");
    expect(container.textContent).toContain("زیان ۲٫۱٪ از سقف ضرر روزانه‌ی ۳٪");
  });

  it("writes the Persian guard, loss and counts without Latin digits for a limit already reached", async () => {
    const reached = { ...today, lossPct: 3.4, usedShare: 3.4 / 3, state: "reached", leftOut: 2, openWithoutRisk: 1 };
    const { container } = await renderScreen("fa", full({ today: reached, performance: snapshot({ sample: true }) }));
    expect(latinDigitStrings(container, [/Asia\/Tehran/g])).toEqual([]);
    expect(englishLeaks(container, [/Asia\/Tehran/g, /EURUSD|BTCUSDT/g])).toEqual([]);
    expect(screen.getAllByText("داده نمونه").length).toBeGreaterThan(4);
  });

  it("writes the session time, the guard sentences and the discipline numbers in Persian digits too", async () => {
    const session = { id: "s1", status: "active", market: "crypto", sessionLabel: "باز شدن لندن", emotionalState: null, mistakeToAvoid: "فومو بعد از ضرر", startedAt: new Date(Date.now() - 135 * 60_000).toISOString(), maxDailyLoss: null };
    // The guard sentences of an older server, in English with Latin digits: the page rewrites them with the numbers in Persian.
    const alerts = [
      { key: "daily_loss_limit", severity: "danger", message: "Daily loss limit reached: 3.2% of 3.0% max." },
      { key: "overtrading", severity: "warning", message: "6 trades today (session limit: 5)." },
      { key: "unplanned_trades", severity: "warning", message: "2 trades today without a written plan or playbook." }
    ];
    (apiFetch as Mock).mockImplementation(async (path: string) => {
      const key = path.split("?")[0];
      const routes: Record<string, unknown> = {
        "/api/dashboard/overview": full({ activeSession: session }),
        "/api/discipline": { ...discipline, propGuard: { ...discipline.propGuard, alerts } },
        "/api/discipline/streak": streak
      };
      return routes[key];
    });
    const { container } = render(<DashboardScreen locale="fa" messages={messages.fa} />);
    await screen.findByTestId("discipline-streak-panel");
    await screen.findByText("امتیاز انضباط هفتگی");
    expect(latinDigitStrings(container, [/Asia\/Tehran/g])).toEqual([]);
    expect(screen.getByText(/۲ ساعت و ۱۵ دقیقه/)).toBeInTheDocument();
  });

  it("calls a plan پلن in the new blocks, never برنامه", async () => {
    const { container } = await renderScreen("fa", full());
    const text = container.textContent ?? "";
    expect(text.split(/(?<=[.؛:])\s*/).filter((sentence) => /برنامه(?!‌ریزی)/.test(sentence))).toEqual([]);
  });
});
