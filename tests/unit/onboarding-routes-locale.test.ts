import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/security/audit", () => ({ auditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/services/onboarding", () => ({ getOnboardingProfile: vi.fn(), saveOnboardingProfile: vi.fn() }));

import { requireUser } from "@/lib/auth/session";
import { saveOnboardingProfile } from "@/lib/services/onboarding";
import { GET as plan } from "@/app/api/onboarding/plan/route";
import { POST as sprint } from "@/app/api/onboarding/sprint/route";

const PERSIAN_LETTER = /[؀-ۿ]/;

function getPlan(query: string) {
  return plan(new Request(`http://localhost/api/onboarding/plan?${query}`));
}

function postSprint(body: object) {
  return sprint(
    new Request("http://localhost/api/onboarding/sprint", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ id: "u1", locale: "en" } as never);
  vi.mocked(saveOnboardingProfile).mockResolvedValue({ id: "p1", segment: "beginner-crypto-no_plan", starterStrategyId: null, firstReviewId: null } as never);
});

describe("GET /api/onboarding/plan language", () => {
  it("writes the plan in the language the screen asked for", async () => {
    const fa = (await (await getPlan("language=fa")).json()).data;
    const en = (await (await getPlan("language=en")).json()).data;

    expect(fa.language).toBe("fa");
    expect(fa.focusAreas[0]).toMatch(PERSIAN_LETTER);
    expect(fa.startingChecklist.every((line: string) => PERSIAN_LETTER.test(line))).toBe(true);
    expect(en.language).toBe("en");
    expect(en.focusAreas[0]).toBe("Write a one-line plan before each trade");
  });

  it("falls back to the saved language when the request names none or an unsupported one", async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: "u1", locale: "fa" } as never);
    expect((await (await getPlan("")).json()).data.language).toBe("fa");

    vi.mocked(requireUser).mockResolvedValue({ id: "u1", locale: "en" } as never);
    expect((await (await getPlan("")).json()).data.language).toBe("en");
    expect((await (await getPlan("language=de")).json()).data.language).toBe("en");
  });

  it("answers in Persian when neither the request nor the settings name a language", async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: "u1" } as never);

    const data = (await (await getPlan("")).json()).data;

    expect(data.language).toBe("fa");
    expect(data.focusAreas[0]).toMatch(PERSIAN_LETTER);
  });
});

describe("POST /api/onboarding/sprint language", () => {
  it("saves the sprint in the language the screen asked for", async () => {
    await postSprint({ experience: "beginner", market: "crypto", disciplineIssue: "no_plan", language: "fa" });

    expect(saveOnboardingProfile).toHaveBeenCalledWith("u1", expect.objectContaining({ language: "fa", market: "crypto" }));
  });

  it("falls back to the saved language, then to Persian", async () => {
    await postSprint({ experience: "beginner" });
    expect(saveOnboardingProfile).toHaveBeenLastCalledWith("u1", expect.objectContaining({ language: "en" }));

    vi.mocked(requireUser).mockResolvedValue({ id: "u1" } as never);
    await postSprint({ language: "de" });
    expect(saveOnboardingProfile).toHaveBeenLastCalledWith("u1", expect.objectContaining({ language: "fa" }));
  });
});
