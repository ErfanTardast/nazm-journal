import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn(async () => ({ id: "user-1" })) }));
vi.mock("@/lib/security/audit", () => ({ auditLog: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/services/trades", () => ({ createTrade: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { tradePlan: { findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn() } }
}));

import { prisma } from "@/lib/db/prisma";
import { PATCH, POST } from "@/app/api/trade-plans/route";

const stored = { id: "plan-12345", userId: "user-1", status: "active", checklist: { direction: "short" }, convertedTradeId: null };

function send(handler: typeof PATCH | typeof POST, method: string, body: object) {
  return handler(new Request("http://localhost/api/trade-plans", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
}

const written = () => vi.mocked(prisma.tradePlan.updateMany).mock.calls[0][0] as { where: Record<string, unknown>; data: Record<string, unknown> };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.tradePlan.findFirst).mockResolvedValue(stored as never);
  vi.mocked(prisma.tradePlan.updateMany).mockResolvedValue({ count: 1 } as never);
});

// A PATCH that only carries some fields must write only those fields.
describe("PATCH /api/trade-plans", () => {
  it("does not write a status when the request did not send one", async () => {
    const response = await send(PATCH, "PATCH", { id: "plan-12345", checklist: { direction: "long" } });
    expect(response.status).toBe(200);
    const { data, where } = written();
    expect(data.checklist).toEqual({ direction: "long" });
    // Prisma skips undefined, so the stored "active" status survives.
    expect(data.status).toBeUndefined();
    expect(where).not.toHaveProperty("status");
  });

  it("does not replace the checklist when only the notes change", async () => {
    await send(PATCH, "PATCH", { id: "plan-12345", notes: "Moved the stop" });
    const { data } = written();
    expect(data.notes).toBe("Moved the stop");
    expect(data.checklist).toBeUndefined();
    expect(data.status).toBeUndefined();
  });

  it("still writes a status that was sent", async () => {
    await send(PATCH, "PATCH", { id: "plan-12345", status: "canceled" });
    expect(written().data.status).toBe("canceled");
  });

  it("still refuses a value the create form would refuse", async () => {
    const response = await send(PATCH, "PATCH", { id: "plan-12345", status: "archived" });
    expect(response.status).toBe(422);
    expect(prisma.tradePlan.updateMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/trade-plans", () => {
  it("still gives a new plan the planned status and an empty checklist", async () => {
    vi.mocked(prisma.tradePlan.create).mockResolvedValue({ id: "plan-99999" } as never);
    const response = await send(POST, "POST", { market: "crypto", symbol: "btcusdt", bias: "Above 65k", entryZone: "64600-65100" });
    expect(response.status).toBe(201);
    const data = (vi.mocked(prisma.tradePlan.create).mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.status).toBe("planned");
    expect(data.checklist).toEqual({});
  });
});
