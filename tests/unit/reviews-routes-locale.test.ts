import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/security/audit", () => ({ auditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/services/reviews", () => ({
  generateReview: vi.fn(),
  createReview: vi.fn(),
  updateReview: vi.fn(),
  createReviewReminder: vi.fn(),
  listReviews: vi.fn(),
  getReviewFocus: vi.fn(),
  deleteReview: vi.fn()
}));

import { requireUser } from "@/lib/auth/session";
import { createReview, createReviewReminder, generateReview, updateReview } from "@/lib/services/reviews";
import { POST as generate } from "@/app/api/reviews/generate/route";
import { PATCH as update, POST as create } from "@/app/api/reviews/route";
import { POST as reminder } from "@/app/api/reviews/[id]/reminder/route";

function request(path: string, method: string, body?: unknown) {
  return new Request(`http://localhost/api/reviews${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

const created = { type: "daily", title: "Daily", periodStart: "2026-06-01", periodEnd: "2026-06-02" };

/** Each review route that writes generated text, how to call it, and which argument carries the language. */
const routes = [
  { name: "generate", call: (body: object) => generate(request("/generate", "POST", { type: "daily", ...body })), spy: generateReview, localeAt: 2, result: { review: { id: "r1" }, reminder: null } },
  { name: "create", call: (body: object) => create(request("", "POST", { ...created, ...body })), spy: createReview, localeAt: 2, result: { id: "r1" } },
  { name: "update (carry forward)", call: (body: object) => update(request("", "PATCH", { id: "review_12345", status: "completed", carryForward: true, ...body })), spy: updateReview, localeAt: 2, result: { review: { id: "r1" }, carryForwardReview: null } },
  { name: "reminder", call: (body: object) => reminder(request("/review_12345/reminder", "POST", body), { params: Promise.resolve({ id: "review_12345" }) }), spy: createReviewReminder, localeAt: 2, result: { id: "alert_1" } }
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ id: "u1", locale: "en" } as never);
  for (const route of routes) vi.mocked(route.spy).mockResolvedValue(route.result as never);
});

describe.each(routes)("reviews $name carries the language to the generator", ({ call, spy, localeAt }) => {
  it("uses the language the screen sent", async () => {
    const response = await call({ locale: "fa" });

    expect(response.status).toBeLessThan(300);
    expect(vi.mocked(spy).mock.calls[0][localeAt]).toBe("fa");
  });

  it("falls back to the language saved in the user's settings, then to Persian", async () => {
    await call({});
    expect(vi.mocked(spy).mock.calls[0][localeAt]).toBe("en");

    vi.mocked(spy).mockClear();
    vi.mocked(requireUser).mockResolvedValue({ id: "u1" } as never);
    await call({});
    expect(vi.mocked(spy).mock.calls[0][localeAt]).toBe("fa");
  });

  it("rejects a language other than fa or en", async () => {
    const response = await call({ locale: "xx" });

    expect(response.status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
  });
});
