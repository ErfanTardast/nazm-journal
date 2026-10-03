import { beforeEach, describe, expect, it, vi } from "vitest";

const provider = {
  reviewTrade: vi.fn(),
  journalInsights: vi.fn(),
  weeklyReview: vi.fn(),
  strategyReview: vi.fn(),
  newsSummary: vi.fn()
};

vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/security/audit", () => ({ auditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { aiReview: { create: vi.fn().mockResolvedValue({}) } } }));
vi.mock("@/lib/services/ai", () => ({ getAiProvider: () => provider }));
vi.mock("@/lib/services/ai/coach-context", () => ({ buildReviewContext: vi.fn().mockResolvedValue({ observations: [], nextActions: [] }) }));

import { requireUser } from "@/lib/auth/session";
import { buildReviewContext } from "@/lib/services/ai/coach-context";
import { POST as journalInsights } from "@/app/api/ai/journal-insights/route";
import { POST as newsSummary } from "@/app/api/ai/news-summary/route";
import { POST as reviewTrade } from "@/app/api/ai/review-trade/route";
import { POST as strategyReview } from "@/app/api/ai/strategy-review/route";
import { POST as weeklyReview } from "@/app/api/ai/weekly-review/route";

const answer = { disclaimer: "d", mode: "learning", summary: "s", observations: [], risks: [], nextActions: [] };

function post(path: string, body?: unknown) {
  return new Request(`http://localhost/api/ai/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

const trade = { symbol: "EURUSD", side: "long", entryPrice: 1.1 };

/** Each AI route, how to call it, and which provider call carries the language. */
const routes = [
  { name: "journal-insights", call: (body?: unknown) => journalInsights(post("journal-insights", body)), spy: provider.journalInsights, localeAt: 1, base: {} },
  { name: "weekly-review", call: (body?: unknown) => weeklyReview(post("weekly-review", body)), spy: provider.weeklyReview, localeAt: 2, base: { mode: "learning" } },
  { name: "news-summary", call: (body?: unknown) => newsSummary(post("news-summary", body)), spy: provider.newsSummary, localeAt: 2, base: { mode: "learning" } },
  { name: "strategy-review", call: (body?: unknown) => strategyReview(post("strategy-review", body)), spy: provider.strategyReview, localeAt: 3, base: { mode: "learning" } },
  { name: "review-trade", call: (body?: unknown) => reviewTrade(post("review-trade", body)), spy: provider.reviewTrade, localeAt: 2, base: { ...trade, mode: "learning" } }
];

beforeEach(() => {
  vi.clearAllMocks();
  for (const spy of Object.values(provider)) spy.mockResolvedValue(answer);
  vi.mocked(requireUser).mockResolvedValue({ id: "u1", locale: "en" } as never);
  vi.mocked(buildReviewContext).mockResolvedValue({ observations: [], nextActions: [] });
});

describe.each(routes)("POST /api/ai/$name carries the language to the coach", ({ call, spy, localeAt, base }) => {
  it("uses the language the screen sent", async () => {
    const response = await call({ ...base, locale: "fa" });

    expect(response.status).toBe(200);
    expect(spy.mock.calls[0][localeAt]).toBe("fa");
  });

  it("falls back to the language saved in the user's settings", async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: "u1", locale: "en" } as never);
    await call({ ...base });
    expect(spy.mock.calls[0][localeAt]).toBe("en");

    spy.mockClear();
    vi.mocked(requireUser).mockResolvedValue({ id: "u1", locale: "fa" } as never);
    await call({ ...base });
    expect(spy.mock.calls[0][localeAt]).toBe("fa");
  });

  it("answers in Persian when neither the request nor the settings name a language", async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: "u1" } as never);
    await call({ ...base });

    expect(spy.mock.calls[0][localeAt]).toBe("fa");
  });

  it("rejects a language other than fa or en", async () => {
    const response = await call({ ...base, locale: "de" });

    expect(response.status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("POST /api/ai/journal-insights without a body", () => {
  it("still works and follows the saved language", async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: "u1", locale: "fa" } as never);
    const response = await journalInsights(post("journal-insights"));

    expect(response.status).toBe(200);
    expect(provider.journalInsights).toHaveBeenCalledWith("u1", "fa");
  });
});

describe("POST /api/ai/review-trade", () => {
  it("grounds the review in the saved context, in the same language", async () => {
    await reviewTrade(post("review-trade", { ...trade, mode: "learning", locale: "fa" }));

    expect(buildReviewContext).toHaveBeenCalledWith("u1", "EURUSD", "fa");
  });

  it("refuses a signal request in Persian for a Persian screen and in English for an English one", async () => {
    const asked = { ...trade, mode: "learning", notes: "آیا الان بخرم؟" };

    const fa = await (await reviewTrade(post("review-trade", { ...asked, locale: "fa" }))).json();
    expect(fa.data.refused).toBe(true);
    expect(fa.data.review.summary).toMatch(/[؀-ۿ]/);
    expect(fa.data.review.disclaimer).toMatch(/[؀-ۿ]/);

    const en = await (await reviewTrade(post("review-trade", { ...asked, locale: "en" }))).json();
    expect(en.data.refused).toBe(true);
    expect(en.data.review.summary).toMatch(/does not provide/);
    expect(provider.reviewTrade).not.toHaveBeenCalled();
  });
});
