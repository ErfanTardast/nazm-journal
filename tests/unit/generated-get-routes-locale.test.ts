import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/services/discipline", () => ({ getDisciplineOverview: vi.fn() }));
vi.mock("@/lib/services/mentor-report", () => ({ getMentorReport: vi.fn() }));
vi.mock("@/lib/services/dashboard", () => ({ getDashboardOverview: vi.fn() }));

import { requireUser } from "@/lib/auth/session";
import { getDashboardOverview } from "@/lib/services/dashboard";
import { getDisciplineOverview } from "@/lib/services/discipline";
import { getMentorReport } from "@/lib/services/mentor-report";
import { GET as dashboard } from "@/app/api/dashboard/overview/route";
import { GET as discipline } from "@/app/api/discipline/route";
import { GET as mentorReport } from "@/app/api/mentor-report/route";

/** Each GET route that returns generated sentences, how to call it, and where the language lands. */
const routes = [
  {
    name: "discipline",
    call: (query: string) => discipline(new Request(`http://localhost/api/discipline${query}`)),
    languageOf: () => vi.mocked(getDisciplineOverview).mock.calls[0][1]
  },
  {
    name: "mentor-report",
    call: (query: string) => mentorReport(new Request(`http://localhost/api/mentor-report${query}`)),
    languageOf: () => vi.mocked(getMentorReport).mock.calls[0][1]?.locale
  },
  {
    name: "dashboard overview",
    call: (query: string) => dashboard(new Request(`http://localhost/api/dashboard/overview${query}`)),
    languageOf: () => vi.mocked(getDashboardOverview).mock.calls[0][1]
  }
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ id: "u1", tier: "elite", locale: "en" } as never);
  vi.mocked(getDisciplineOverview).mockResolvedValue({} as never);
  vi.mocked(getMentorReport).mockResolvedValue({ shareSafe: true } as never);
  vi.mocked(getDashboardOverview).mockResolvedValue({} as never);
});

describe.each(routes)("GET /api/$name carries the language to the generator", ({ call, languageOf }) => {
  it("uses the language the screen asked for in ?locale=", async () => {
    expect((await call("?locale=fa")).status).toBe(200);
    expect(languageOf()).toBe("fa");
  });

  it("falls back to the language saved in the user's settings", async () => {
    await call("");
    expect(languageOf()).toBe("en");
  });

  it("ignores an unsupported language and answers in the saved one, then in Persian", async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: "u1", tier: "elite", locale: "fa" } as never);
    await call("?locale=de");
    expect(languageOf()).toBe("fa");
  });

  it("answers in Persian when neither the request nor the settings name a language", async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: "u1", tier: "elite" } as never);
    await call("");
    expect(languageOf()).toBe("fa");
  });
});

describe("GET /api/mentor-report keeps its other options", () => {
  it("still passes hidePnl next to the language", async () => {
    await mentorReport(new Request("http://localhost/api/mentor-report?hidePnl=true&locale=fa"));

    expect(getMentorReport).toHaveBeenCalledWith("u1", { hidePnl: true, locale: "fa" });
  });
});
