import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn(), publicUser: (user: unknown) => user }));
vi.mock("@/lib/security/audit", () => ({ auditLog: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { update: vi.fn(async (args?: { data?: object }) => ({ id: "u1", ...args?.data })) } } }));

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { GET, PATCH } from "@/app/api/users/me/settings/route";

const user = { id: "u1", locale: "fa", theme: "dark", timezone: "UTC", riskPerTradePct: "1", maxDailyLossPct: "3", maxWeeklyLossPct: "6" };

describe("/api/users/me/settings starting balance", () => {
  beforeEach(() => vi.mocked(prisma.user.update).mockClear());

  it("returns the starting balance as a number, or null when not set", async () => {
    vi.mocked(requireUser).mockResolvedValue({ ...user, startingBalance: "10000" } as never);
    expect((await (await GET()).json()).data.settings.startingBalance).toBe(10_000);

    vi.mocked(requireUser).mockResolvedValue({ ...user, startingBalance: null } as never);
    expect((await (await GET()).json()).data.settings.startingBalance).toBeNull();
  });

  it("returns the broker time zone, the New York close convention until one is chosen", async () => {
    vi.mocked(requireUser).mockResolvedValue({ ...user, startingBalance: null, brokerTimeZone: null } as never);
    expect((await (await GET()).json()).data.settings.brokerTimeZone).toBe("mt5:new-york-close");

    vi.mocked(requireUser).mockResolvedValue({ ...user, startingBalance: null, brokerTimeZone: "Etc/GMT-2" } as never);
    expect((await (await GET()).json()).data.settings.brokerTimeZone).toBe("Etc/GMT-2");
  });

  it("saves the balance from the form and clears it when the field is emptied", async () => {
    vi.mocked(requireUser).mockResolvedValue({ ...user, startingBalance: null } as never);
    const patch = (body: object) =>
      PATCH(new Request("http://localhost/api/users/me/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

    await patch({ startingBalance: "10000" });
    await patch({ startingBalance: "" });

    expect(vi.mocked(prisma.user.update).mock.calls.map((call) => (call[0] as { data: { startingBalance?: unknown } }).data.startingBalance)).toEqual([10_000, null]);
  });
});
