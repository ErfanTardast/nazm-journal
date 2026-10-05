import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import { englishLeaks } from "./support/english-leaks";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { DashboardScreen, DisciplinePanel } from "@/features/dashboard/dashboard-screen";
import { checkPropGuard } from "@/lib/calculations/prop-guard";

const en = getMessages("en");
const fa = getMessages("fa");
const ARABIC_SCRIPT = /[\u0600-\u06FF]/;

type Call = { key: string; body?: Record<string, unknown> };
const calls: Call[] = [];
const posted = (key: string) => calls.filter((call) => call.key === key);

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

const overview = {
  metrics: { totalTrades: 4, winRate: 0.5 },
  openTrades: 0,
  plannedTrades: [{ id: "p1", symbol: "EURUSD", market: "forex", bias: "صعودی بالای حمایت", status: "planned", invalidationRule: "بسته شدن زیر حمایت", riskPercent: 1 }],
  repeatedMistakes: ["ورود زودهنگام"],
  ruleViolations: 1,
  journalFollowUps: 0,
  completePlanCount: 1,
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
  reviewFocus: { review: { id: "r1", title: "مرور روزانه", status: "open", periodEnd: "2026-09-30T00:00:00Z" }, overdueCount: 1, suggestedType: "daily" },
  activeSession: null
};

const activeSession = {
  id: "s1",
  status: "active",
  market: "crypto",
  sessionLabel: "باز شدن لندن",
  emotionalState: null,
  mistakeToAvoid: "فومو بعد از ضرر",
  startedAt: new Date(Date.now() - 75 * 60_000).toISOString(),
  maxDailyLoss: null
};

// The server's English prop-guard messages, as they arrive.
const discipline = {
  disciplineScore: { score: 82, grade: "B", checks: [{ key: "plan_adherence", score: 50, passed: false, detail: "" }, { key: "rule_discipline", score: 100, passed: true, detail: "" }] },
  propGuard: {
    alerts: [
      { key: "daily_loss_limit", severity: "danger", message: "Daily loss limit reached: 3.2% of 3.0% max." },
      { key: "daily_loss_warning", severity: "warning", message: "Approaching daily loss limit: 2.4% of 3.0% max." },
      { key: "overtrading", severity: "warning", message: "6 trades today (session limit: 5)." },
      { key: "revenge_pattern", severity: "warning", message: "Two consecutive losses. Review the plan before the next entry." },
      { key: "unplanned_trades", severity: "warning", message: "2 trades today without a written plan or playbook." }
    ],
    isBlocked: true,
    todayLossPct: 3.2,
    maxDailyLossPct: 3
  },
  mistakePatterns: [{ mistake: "ورود زودهنگام", frequency: 3, streak: 2, avgRImpact: -0.5 }]
};

/**
 * What the Persian server sends: the real generator, all five alerts (the limit, overtrading, two losses and unplanned trades,
 * then the warning). This build's generator may still say برنامه for a plan; the page shows پلن either way.
 */
const guardBase = { maxDailyLossPct: 3, riskPerTradePct: 1, maxDailyTrades: null, recentResults: [], todayUnplannedCount: 0 };
const persianServerAlerts = [
  ...checkPropGuard({ ...guardBase, todayLossPct: 3.2, todayTradeCount: 6, maxDailyTrades: 5, recentResults: [true, false, false], todayUnplannedCount: 2 }, "fa").alerts,
  ...checkPropGuard({ ...guardBase, todayLossPct: 2.4, todayTradeCount: 1 }, "fa").alerts
];
const persianServerDiscipline = { ...discipline, propGuard: { ...discipline.propGuard, alerts: persianServerAlerts } };

/** The sentences of a page text that call a plan برنامه (برنامه‌ریزی, planning, is fine). */
const wronglyNamedPlans = (text: string) => text.split(/(?<=[.؛:])\s*/).filter((sentence) => /برنامه(?!‌ریزی)/.test(sentence));
const asGlossary = (text: string) => text.replace(/برنامه(?!‌ریزی)/g, "پلن");

const streak = { currentStreak: 3, bestStreak: 5, totalActiveDays: 6, totalDisciplinedDays: 4, lastActiveDate: "2026-09-30", brokeStreakOnLastDay: false, unreviewedDays: 0 };

/** The two generated-text endpoints are asked for in the page language: their keys carry `?locale=`. */
const LOCALIZED = ["GET /api/dashboard/overview", "GET /api/discipline"];

function serve(overrides: Record<string, unknown | ((init?: RequestInit) => unknown)> = {}, locale: "fa" | "en" = "fa") {
  calls.length = 0;
  const asked = (key: string) => (LOCALIZED.includes(key) ? `${key}?locale=${locale}` : key);
  const routes: Record<string, unknown | ((init?: RequestInit) => unknown)> = {
    [asked("GET /api/dashboard/overview")]: overview,
    [asked("GET /api/discipline")]: discipline,
    "GET /api/discipline/streak": streak,
    ...Object.fromEntries(Object.entries(overrides).map(([key, value]) => [asked(key), value]))
  };
  (apiFetch as Mock).mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (!(key in routes)) throw new Error(`Unexpected request ${key}`);
    const handler = routes[key];
    return typeof handler === "function" ? handler(init) : handler;
  });
}

async function renderFa() {
  const view = render(<DashboardScreen locale="fa" messages={fa} />);
  await screen.findByRole("heading", { level: 1 });
  await screen.findByText("امتیاز انضباط هفتگی");
  return view;
}

describe("DashboardScreen in Persian", () => {
  it("has no English label, badge, status, market or generated message", async () => {
    serve();
    const { container } = await renderFa();
    await screen.findByTestId("discipline-streak-panel");
    expect(englishLeaks(container)).toEqual([]);
  });

  it("has no English for a new account: no plan, review, mistake, grade or guard alert", async () => {
    serve({
      "GET /api/dashboard/overview": {
        ...overview,
        plannedTrades: [],
        repeatedMistakes: [],
        completePlanCount: 0,
        ruleViolations: 0,
        reviewFocus: { review: null, overdueCount: 0, suggestedType: "daily" },
        readiness: { status: "not_ready", score: 20, primaryAction: "plan", checks: overview.readiness.checks.map((check) => ({ ...check, passed: false, count: 0 })) }
      },
      "GET /api/discipline": { disciplineScore: null, propGuard: { alerts: [], isBlocked: false, todayLossPct: 0, maxDailyLossPct: 3 }, mistakePatterns: [] },
      "GET /api/discipline/streak": { ...streak, currentStreak: 0, bestStreak: 0, totalActiveDays: 0, totalDisciplinedDays: 0 }
    });
    const { container } = render(<DashboardScreen locale="fa" messages={fa} />);
    await screen.findByText("هنوز داده کافی نیست");
    await screen.findByTestId("discipline-streak-panel");
    expect(englishLeaks(container)).toEqual([]);
  });

  it("has no English for every readiness status and next action", async () => {
    for (const [status, primaryAction] of [["ready", "ready"], ["caution", "journal"], ["not_ready", "risk"]] as const) {
      serve({ "GET /api/dashboard/overview": { ...overview, readiness: { ...overview.readiness, status, primaryAction } } });
      const { container, unmount } = render(<DashboardScreen locale="fa" messages={fa} />);
      await screen.findByText("امتیاز انضباط هفتگی");
      expect(englishLeaks(container)).toEqual([]);
      unmount();
    }
  });

  it("calls a plan پلن everywhere, never برنامه (planning, برنامه‌ریزی, is the only use left)", async () => {
    const seen: string[] = [];
    for (const [status, primaryAction] of [["ready", "ready"], ["caution", "plan"], ["not_ready", "review"], ["not_ready", "journal"], ["not_ready", "risk"]] as const) {
      // With a plan, and with none (the "no plan" line); with the guard sentences of an older server (English) and of this one (Persian).
      for (const plannedTrades of [overview.plannedTrades, []]) {
        for (const guards of [discipline, persianServerDiscipline]) {
          serve({ "GET /api/dashboard/overview": { ...overview, plannedTrades, readiness: { ...overview.readiness, status, primaryAction } }, "GET /api/discipline": guards });
          const { container, unmount } = render(<DashboardScreen locale="fa" messages={fa} />);
          await screen.findByText("امتیاز انضباط هفتگی");
          await screen.findByTestId("discipline-streak-panel");
          seen.push(...wronglyNamedPlans(container.textContent ?? ""));
          unmount();
        }
      }
    }
    expect(seen).toEqual([]);
  });

  it("uses پلن in the headline, the next action, the plan tile, the checks and the quick actions", async () => {
    serve({ "GET /api/dashboard/overview": { ...overview, plannedTrades: [], readiness: { ...overview.readiness, status: "not_ready", primaryAction: "plan" } } });
    await renderFa();
    expect(screen.getByText("ساخت پلن کامل")).toBeInTheDocument();
    expect(screen.getByText("پلن امروز")).toBeInTheDocument();
    expect(screen.getByText("پلن فعالی آماده نیست. ابتدا سناریو، ریسک، ابطال و چک‌لیست را مشخص کنید.")).toBeInTheDocument();
    expect(screen.getByText("یک پلن مکتوب کامل")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "پلن جدید" })).toBeInTheDocument();
    expect(screen.getByText(/پلن را مرور کنید/)).toBeInTheDocument();
    expect(screen.getByText(/بدون پلن مکتوب یا پلی‌بوک/)).toBeInTheDocument();
    expect(screen.getByText("پلن‌ها ۵۰٪")).toBeInTheDocument();
  });

  it("shows the plan's market and status and the review's status in Persian", async () => {
    serve();
    await renderFa();
    expect(screen.getByText(/فارکس/)).toBeInTheDocument();
    expect(screen.getByText("برنامه‌ریزی‌شده")).toBeInTheDocument();
    expect(screen.getByText("باز")).toBeInTheDocument();
  });

  it("explains each trading guard in Persian with the server's numbers", async () => {
    serve();
    await renderFa();
    expect(screen.getByText(/به سقف ضرر روزانه رسیده‌اید/)).toBeInTheDocument();
    expect(screen.getByText(/۳٫۲٪ از حداکثر ۳٫۰٪/)).toBeInTheDocument();
    expect(screen.getByText(/۶ معامله امروز|۶ معامله/)).toBeInTheDocument();
  });

  it("has no English in the active session panel", async () => {
    serve({ "GET /api/dashboard/overview": { ...overview, activeSession } });
    const { container } = await renderFa();
    expect(englishLeaks(container)).toEqual([]);
    expect(screen.getByText(/ساعت/)).toBeInTheDocument();
    expect(screen.getByText(/کریپتو/)).toBeInTheDocument();
  });

  it("has no English in the start-session form", async () => {
    serve();
    const { container } = await renderFa();
    fireEvent.click(screen.getByRole("button", { name: "شروع جلسه" }));
    expect(screen.getByRole("button", { name: "انصراف" })).toBeInTheDocument();
    expect(englishLeaks(container)).toEqual([]);
  });

  it("has no English when the overview cannot be loaded", async () => {
    (apiFetch as Mock).mockRejectedValue(new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR"));
    const { container } = render(<DashboardScreen locale="fa" messages={fa} />);
    await waitFor(() => expect(container.textContent).toMatch(ARABIC_SCRIPT));
    await waitFor(() => expect(container.textContent).toContain("وضعیت آمادگی در دسترس نیست"));
    expect(englishLeaks(container)).toEqual([]);
  });

  it("does not print one sentence twice when the overview cannot be loaded", async () => {
    (apiFetch as Mock).mockRejectedValue(new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR"));
    render(<DashboardScreen locale="fa" messages={fa} />);
    expect(await screen.findByText("بارگذاری داشبورد ممکن نشد. صفحه را دوباره باز کنید یا چند لحظه بعد تلاش کنید.")).toBeInTheDocument();
    expect(screen.getAllByText("وضعیت آمادگی در دسترس نیست")).toHaveLength(1);
  });
});

describe("DashboardScreen asks the server for generated text in the page language", () => {
  it.each(["fa", "en"] as const)("sends locale=%s on the overview and the discipline summary", async (locale) => {
    serve({}, locale);
    render(<DashboardScreen locale={locale} messages={locale === "fa" ? fa : en} />);
    await screen.findByTestId("discipline-streak-panel");
    const asked = calls.map((call) => call.key);
    expect(asked).toContain(`GET /api/dashboard/overview?locale=${locale}`);
    expect(asked).toContain(`GET /api/discipline?locale=${locale}`);
    expect(asked.filter((key) => key.startsWith("GET /api/dashboard/overview") && !key.includes(`locale=${locale}`))).toEqual([]);
    expect(asked.filter((key) => key.startsWith("GET /api/discipline?") && !key.includes(`locale=${locale}`))).toEqual([]);
  });

  describe("with the sentences the Persian server really writes", () => {
    it("covers every guard key", () => {
      expect(persianServerAlerts.map((alert) => alert.key).sort()).toEqual(["daily_loss_limit", "daily_loss_warning", "overtrading", "revenge_pattern", "unplanned_trades"]);
    });

    it("shows each one with the numbers the server wrote and پلن for a plan", async () => {
      serve({ "GET /api/discipline": persianServerDiscipline });
      const { container } = await renderFa();
      await screen.findByTestId("discipline-streak-panel");
      for (const alert of persianServerAlerts) expect(screen.getByText(asGlossary(alert.message))).toBeInTheDocument();
      expect(wronglyNamedPlans(container.textContent ?? "")).toEqual([]);
      expect(container.textContent).toContain("۳٫۲٪ از حداکثر ۳٫۰٪");
      expect(englishLeaks(container)).toEqual([]);
    });
  });

  it("shows the Persian guard sentences the server wrote itself", async () => {
    const limit = "به سقف ضرر روزانه رسیده‌اید: ۳٫۲٪ از حداکثر ۳٫۰٪.";
    const unplanned = "۲ معامله امروز بدون پلن مکتوب یا پلی‌بوک ثبت شده است.";
    serve({
      "GET /api/discipline": {
        ...discipline,
        propGuard: {
          ...discipline.propGuard,
          alerts: [
            { key: "daily_loss_limit", severity: "danger", message: limit },
            { key: "unplanned_trades", severity: "warning", message: unplanned }
          ]
        }
      }
    });
    const { container } = await renderFa();
    expect(screen.getByText(limit)).toBeInTheDocument();
    expect(screen.getByText(unplanned)).toBeInTheDocument();
    expect(container.textContent).not.toContain("undefined");
  });
});

describe("DashboardScreen keeps the English page in English", () => {
  it("shows English market and status names and Cancel", async () => {
    serve({}, "en");
    render(<DashboardScreen locale="en" messages={en} />);
    await screen.findByText("Weekly discipline score");
    expect(screen.getByText("Planned")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start session" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Stocks" })).toBeInTheDocument();
  });

  it("does not print one sentence twice when the overview cannot be loaded", async () => {
    (apiFetch as Mock).mockRejectedValue(new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR"));
    render(<DashboardScreen locale="en" messages={en} />);
    expect(await screen.findByText("The dashboard could not be loaded. Reload the page or try again in a moment.")).toBeInTheDocument();
    expect(screen.getAllByText("Readiness is unavailable")).toHaveLength(1);
  });

  it("leaves the server's prop-guard sentences as they are", async () => {
    serve({}, "en");
    render(<DashboardScreen locale="en" messages={en} />);
    expect(await screen.findByText("Daily loss limit reached: 3.2% of 3.0% max.")).toBeInTheDocument();
  });
});

describe("DisciplinePanel check names", () => {
  it("name the five weekly checks with the glossary words", () => {
    const checks = ["plan_adherence", "rule_discipline", "journal_completeness", "mistake_control", "review_consistency"].map((key) => ({ key, score: 80, passed: true, detail: "" }));
    const { container } = render(<DisciplinePanel locale="fa" discipline={{ ...discipline, disciplineScore: { score: 80, grade: "B", checks } } as never} />);
    for (const label of ["پلن‌ها ۸۰٪", "قوانین ۸۰٪", "ژورنال ۸۰٪", "خطاها ۸۰٪", "مرورها ۸۰٪"]) expect(screen.getByText(label)).toBeInTheDocument();
    expect(container.textContent).not.toContain("اشتباهات");
  });
});

describe("DisciplinePanel mistake patterns", () => {
  const patternDiscipline = { ...discipline, propGuard: { ...discipline.propGuard, alerts: [] } };

  it("labels the streak and the average R in Persian", () => {
    const { container } = render(<DisciplinePanel locale="fa" discipline={patternDiscipline as never} />);
    expect(container.textContent).toContain("میانگین R");
    expect(container.textContent).not.toContain("آخرین");
    expect(englishLeaks(container)).toEqual([]);
  });

  it("keeps the English wording", () => {
    const { container } = render(<DisciplinePanel locale="en" discipline={patternDiscipline as never} />);
    expect(container.textContent).toContain("streak: 2/5");
    expect(container.textContent).toContain("avg R -0.50");
  });
});

describe("DashboardScreen shows a failed session start or stop", () => {
  async function openStartForm() {
    const view = await renderFa();
    fireEvent.click(screen.getByRole("button", { name: "شروع جلسه" }));
    const form = view.container.querySelector("form") as HTMLFormElement;
    fireEvent.change(form.querySelector('input[type="text"]')!, { target: { value: "باز شدن لندن" } });
    return { ...view, form };
  }

  it("tells the trader in Persian when the session could not be started, and keeps the form", async () => {
    serve({
      "POST /api/sessions": () => {
        throw new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR");
      }
    });
    const { container, form } = await openStartForm();
    fireEvent.submit(form);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(ARABIC_SCRIPT);
    expect(englishLeaks(alert)).toEqual([]);
    // The typed text is still there so the trader can retry.
    expect((container.querySelector('form input[type="text"]') as HTMLInputElement).value).toBe("باز شدن لندن");
    expect(posted("POST /api/sessions")).toHaveLength(1);
  });

  it("names the rejected field in Persian for a validation failure", async () => {
    serve({
      "POST /api/sessions": () => {
        throw new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { fieldErrors: { sessionLabel: ["Too small"] } });
      }
    });
    const { form } = await openStartForm();
    fireEvent.submit(form);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("بازه زمانی");
    expect(alert.textContent).not.toMatch(/validation/i);
  });

  it("asks for the session window instead of doing nothing when it is blank", async () => {
    serve();
    const { form } = await openStartForm();
    fireEvent.change(form.querySelector('input[type="text"]')!, { target: { value: "   " } });
    fireEvent.submit(form);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(ARABIC_SCRIPT);
    expect(posted("POST /api/sessions")).toHaveLength(0);
  });

  it("clears the message and refreshes when the retry works", async () => {
    let attempts = 0;
    serve({
      "POST /api/sessions": () => {
        attempts += 1;
        if (attempts === 1) throw new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR");
        return { session: { id: "s1" } };
      }
    });
    const { form } = await openStartForm();
    fireEvent.submit(form);
    await screen.findByRole("alert");
    fireEvent.submit(form);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(calls.filter((call) => call.key === "GET /api/dashboard/overview?locale=fa")).toHaveLength(2);
  });

  it("shows the sign-in card when the session expired while starting", async () => {
    serve({
      "POST /api/sessions": () => {
        throw new ApiClientError("Authentication is required", 401, "UNAUTHORIZED");
      }
    });
    const { form } = await openStartForm();
    fireEvent.submit(form);
    expect(await screen.findByText("ورود لازم است")).toBeInTheDocument();
  });

  it("tells the trader in Persian when the session could not be completed", async () => {
    serve({
      "GET /api/dashboard/overview": { ...overview, activeSession },
      "PATCH /api/sessions/s1": () => {
        throw new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR");
      }
    });
    await renderFa();
    fireEvent.click(screen.getByRole("button", { name: "پایان جلسه" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(ARABIC_SCRIPT);
    expect(englishLeaks(alert)).toEqual([]);
    // The session is still shown as active: nothing pretended it had ended.
    expect(screen.getByRole("button", { name: "پایان جلسه" })).toBeInTheDocument();
  });

  it("shows an English message on the English page", async () => {
    serve(
      {
        "GET /api/dashboard/overview": { ...overview, activeSession },
        "PATCH /api/sessions/s1": () => {
          throw new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR");
        }
      },
      "en"
    );
    render(<DashboardScreen locale="en" messages={en} />);
    fireEvent.click(await screen.findByRole("button", { name: "Abandon" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/could not be/i);
  });
});
