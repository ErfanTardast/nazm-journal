import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/security/audit", () => ({ auditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/services/billing", () => ({
  getBillingOverview: vi.fn(),
  submitPayment: vi.fn(),
  createUsdtIntent: vi.fn(),
  listPaymentsForAdmin: vi.fn(),
  reviewPayment: vi.fn()
}));

import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { createUsdtIntent, getBillingOverview, listPaymentsForAdmin, reviewPayment, submitPayment } from "@/lib/services/billing";
import { POST as intentPOST } from "@/app/api/billing/usdt-intents/route";
import { GET as billingGET } from "@/app/api/billing/route";
import { POST as submitPOST } from "@/app/api/billing/payments/route";
import { GET as adminListGET } from "@/app/api/admin/payments/route";
import { POST as adminReviewPOST } from "@/app/api/admin/payments/[id]/route";

const user = { id: "u1", tier: "free", tierExpiresAt: null, roles: [] };

function json(url: string, body: unknown) {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue(user as never);
});

describe("GET /api/billing", () => {
  it("returns the signed-in user's billing overview", async () => {
    vi.mocked(getBillingOverview).mockResolvedValue({ tier: "free" } as never);
    const res = await billingGET();
    expect((await res.json()).data.tier).toBe("free");
    expect(getBillingOverview).toHaveBeenCalledWith(user);
  });
});

describe("POST /api/billing/payments", () => {
  it("validates and submits a payment for review", async () => {
    vi.mocked(submitPayment).mockResolvedValue({ id: "p1", status: "pending" } as never);
    const res = await submitPOST(
      json("http://localhost/api/billing/payments", {
        tier: "pro",
        method: "usdt_trc20",
        trackingCode: "c".repeat(64),
        paidAt: "2026-09-30T10:00:00.000Z",
        intentId: "i1"
      })
    );
    expect(res.status).toBe(201);
    expect(submitPayment).toHaveBeenCalledWith(user, {
      tier: "pro",
      method: "usdt_trc20",
      trackingCode: "c".repeat(64),
      paidAt: new Date("2026-09-30T10:00:00.000Z"),
      intentId: "i1"
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", action: "payment.submit", entity: "Payment", entityId: "p1" })
    );
  });

  it("rejects an unknown plan before reaching the service", async () => {
    const res = await submitPOST(
      json("http://localhost/api/billing/payments", { tier: "free", method: "card_to_card", trackingCode: "123456", paidAt: "2026-09-30" })
    );
    expect(res.status).toBe(422);
    expect(submitPayment).not.toHaveBeenCalled();
  });
});

describe("POST /api/billing/usdt-intents", () => {
  it("reserves the exact USDT amount for the chosen plan", async () => {
    vi.mocked(createUsdtIntent).mockResolvedValue({ id: "i1", tier: "elite", amount: 12.01, expiresAt: "x" } as never);
    const res = await intentPOST(json("http://localhost/api/billing/usdt-intents", { tier: "elite" }));
    expect(res.status).toBe(201);
    expect((await res.json()).data.amount).toBe(12.01);
    expect(createUsdtIntent).toHaveBeenCalledWith(user, "elite");
  });

  it("rejects an unknown plan", async () => {
    const res = await intentPOST(json("http://localhost/api/billing/usdt-intents", { tier: "free" }));
    expect(res.status).toBe(422);
    expect(createUsdtIntent).not.toHaveBeenCalled();
  });
});

describe("admin payment routes", () => {
  it("lists payments filtered by status", async () => {
    vi.mocked(listPaymentsForAdmin).mockResolvedValue([] as never);
    await adminListGET(new Request("http://localhost/api/admin/payments?status=pending"));
    expect(listPaymentsForAdmin).toHaveBeenCalledWith(user, "pending");
  });

  it("ignores an unknown status filter", async () => {
    vi.mocked(listPaymentsForAdmin).mockResolvedValue([] as never);
    await adminListGET(new Request("http://localhost/api/admin/payments?status=bogus"));
    expect(listPaymentsForAdmin).toHaveBeenCalledWith(user, undefined);
  });

  it("applies a review action with an optional note", async () => {
    vi.mocked(reviewPayment).mockResolvedValue({ id: "p1", status: "rejected" } as never);
    const res = await adminReviewPOST(json("http://localhost/api/admin/payments/p1", { action: "reject", note: "No match" }), {
      params: Promise.resolve({ id: "p1" })
    });
    expect((await res.json()).data.status).toBe("rejected");
    expect(reviewPayment).toHaveBeenCalledWith(user, "p1", "reject", "No match");
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        action: "payment.review",
        entity: "Payment",
        entityId: "p1",
        metadata: { action: "reject", status: "rejected", note: "No match" }
      })
    );
  });

  it("rejects an unknown review action", async () => {
    const res = await adminReviewPOST(json("http://localhost/api/admin/payments/p1", { action: "delete" }), {
      params: Promise.resolve({ id: "p1" })
    });
    expect(res.status).toBe(422);
    expect(reviewPayment).not.toHaveBeenCalled();
  });
});

describe("payment routes while payments are off (production trial)", () => {
  it("answer 404 without touching billing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_PAYMENTS_ENABLED", "");
    try {
      const responses = await Promise.all([
        billingGET(),
        submitPOST(json("http://localhost/api/billing/payments", { tier: "pro", method: "card_to_card", trackingCode: "123456789012" })),
        intentPOST(json("http://localhost/api/billing/usdt-intents", { tier: "pro" })),
        adminListGET(new Request("http://localhost/api/admin/payments")),
        adminReviewPOST(json("http://localhost/api/admin/payments/p1", { action: "approve" }), { params: Promise.resolve({ id: "p1" }) })
      ]);

      expect(responses.map((res) => res.status)).toEqual([404, 404, 404, 404, 404]);
      expect(getBillingOverview).not.toHaveBeenCalled();
      expect(submitPayment).not.toHaveBeenCalled();
      expect(createUsdtIntent).not.toHaveBeenCalled();
      expect(listPaymentsForAdmin).not.toHaveBeenCalled();
      expect(reviewPayment).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
