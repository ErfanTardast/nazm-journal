import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/observability/metrics", () => ({ getProviderMetrics: vi.fn(async () => []) }));

import { getAdminOverview } from "@/lib/services/admin";

const ADMIN = { roles: [{ role: { name: "admin", permissions: [] } }] };
const TRADER = { roles: [{ role: { name: "trader", permissions: [] } }] };

let tradeCount: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  const { prisma } = await import("@/lib/db/prisma");
  tradeCount = vi.fn(async () => 7);
  Object.assign(prisma, {
    user: { count: vi.fn(async () => 2) },
    trade: { count: tradeCount },
    portfolio: { count: vi.fn(async () => 1) },
    alert: { count: vi.fn(async () => 0) },
    auditLog: { findMany: vi.fn(async () => []) },
    featureFlag: { findMany: vi.fn(async () => []) }
  });
});

describe("admin overview counts", () => {
  it("counts people's own trades only: rows of a sample workspace are left out", async () => {
    const overview = await getAdminOverview(ADMIN as never);
    expect(tradeCount).toHaveBeenCalledWith({ where: { isSample: false } });
    expect(overview.counts.trades).toBe(7);
  });

  it("is still refused for an account that is not an admin", async () => {
    await expect(getAdminOverview(TRADER as never)).rejects.toThrow("Admin access is required");
    expect(tradeCount).not.toHaveBeenCalled();
  });
});
