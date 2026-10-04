import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import {
  createUsdtIntent,
  getBillingOverview,
  listPaymentsForAdmin,
  reviewPayment,
  submitPayment
} from "@/lib/services/billing";
import { PAID_PLANS, USDT_INTENT_TTL_HOURS } from "@/lib/billing/plans";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-01T12:00:00Z");
const ENV = {
  BILLING_CARD_NUMBER: "0000000000000000",
  BILLING_CARD_HOLDER: "Sample Holder",
  // A made-up address in the right format (its checksum is invalid); never a real one.
  BILLING_USDT_TRC20_ADDRESS: "TNazmTestWa11etNotRea1XXXXXXXXXXXX"
};
const TX = "b".repeat(64);
const RRN = "123456789012";
const user = { id: "u1", tier: "free", tierExpiresAt: null };
const admin = { id: "admin1", roles: [{ role: { name: "admin", permissions: [] } }] };
const readOnlyAdmin = { id: "ro1", roles: [{ role: { name: "auditor", permissions: [{ permission: { key: "admin:read" } }] } }] };
const nonAdmin = { id: "u2", roles: [] };

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    userId: "u1",
    tier: "pro",
    periodDays: 30,
    amount: 200000,
    currency: "toman",
    method: "card_to_card",
    trackingCode: RRN,
    claimCode: RRN,
    paidAt: new Date(now.getTime() - DAY),
    status: "pending",
    reviewedAt: null,
    reviewedById: null,
    reviewNote: null,
    isFirstPurchase: false,
    refundedAt: null,
    refundedById: null,
    createdAt: new Date(now.getTime() - DAY),
    ...overrides
  };
}

function intent(overrides: Record<string, unknown> = {}) {
  return payment({
    id: "i1",
    amount: 5.01,
    currency: "usdt",
    method: "usdt_trc20",
    trackingCode: null,
    claimCode: null,
    paidAt: null,
    status: "awaiting_transfer",
    createdAt: new Date(now.getTime() - 60_000),
    ...overrides
  });
}

type Where = Record<string, unknown>;

function fakeDb() {
  const db = {
    payment: {
      findFirst: vi.fn(async (_args: { where: Where }): Promise<unknown> => null),
      findMany: vi.fn(async (_args?: unknown): Promise<unknown[]> => []),
      findUnique: vi.fn(async (): Promise<unknown> => payment()),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => payment(data)),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => intent(data)),
      updateMany: vi.fn(async (_args: unknown) => ({ count: 1 })),
      count: vi.fn(async () => 0)
    },
    user: {
      findUnique: vi.fn(async (): Promise<unknown> => ({ tier: "free", tierExpiresAt: null })),
      update: vi.fn(async () => ({}))
    },
    $queryRaw: vi.fn(async () => []),
    $transaction: vi.fn()
  };
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  return db;
}

let db: ReturnType<typeof fakeDb>;
beforeEach(() => {
  db = fakeDb();
});

const opts = (extra: Record<string, unknown> = {}) => ({ env: ENV, now, db: db as never, ...extra });
const updateManyCall = (i = 0) => (db.payment.updateMany.mock.calls as unknown as [{ where: Where; data: Where }][])[i][0];

describe("getBillingOverview", () => {
  it("returns tier, prices, open methods, the open USDT reservation and the user's purchases", async () => {
    db.payment.findFirst.mockResolvedValue(intent());
    db.payment.findMany.mockResolvedValue([payment()]);
    const overview = await getBillingOverview(user, opts());
    expect(overview.tier).toBe("free");
    expect(overview.plans.pro.priceToman).toBe(PAID_PLANS.pro.priceToman);
    expect(overview.methods.card?.cardNumber).toBe("0000000000000000");
    expect(overview.methods.usdt?.address).toBe(ENV.BILLING_USDT_TRC20_ADDRESS);
    expect(overview.usdtIntent).toMatchObject({ id: "i1", tier: "pro", amount: 5.01 });
    expect(overview.payments[0]).toMatchObject({ id: "p1", amount: 200000, status: "pending" });
  });

  it("marks methods as closed when the owner has not configured them", async () => {
    const overview = await getBillingOverview(user, opts({ env: {} }));
    expect(overview.methods).toEqual({ card: null, usdt: null });
    expect(overview.usdtIntent).toBeNull();
  });
});

describe("createUsdtIntent", () => {
  it("reserves the smallest amount not used by another open USDT purchase", async () => {
    db.payment.findMany.mockResolvedValue([{ amount: 5.01 }, { amount: 5.02 }]);
    const result = await createUsdtIntent(user, "pro", opts());
    expect(db.$queryRaw).toHaveBeenCalled();
    const cutoff = new Date(now.getTime() - USDT_INTENT_TTL_HOURS * 60 * 60 * 1000);
    // Live reservations expire; a submitted (pending) USDT purchase keeps its amount until reviewed.
    expect(db.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { method: "usdt_trc20", OR: [{ status: "awaiting_transfer", createdAt: { gt: cutoff } }, { status: "pending" }] }
      })
    );
    expect(db.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "u1",
        tier: "pro",
        periodDays: 30,
        amount: 5.03,
        currency: "usdt",
        method: "usdt_trc20",
        status: "awaiting_transfer"
      })
    });
    expect(result.amount).toBe(5.03);
  });

  it("returns the user's open reservation for the same plan", async () => {
    db.payment.findFirst.mockImplementation(async ({ where }) => (where.status === "awaiting_transfer" ? intent() : null));
    const result = await createUsdtIntent(user, "pro", opts());
    expect(result).toMatchObject({ id: "i1", amount: 5.01 });
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it("re-reserves when the user switches plan", async () => {
    db.payment.findFirst.mockImplementation(async ({ where }) => (where.status === "awaiting_transfer" ? intent() : null));
    await createUsdtIntent(user, "elite", opts());
    expect(db.payment.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: expect.objectContaining({ tier: "elite", amount: 12.01, periodDays: 30 })
    });
  });

  it("refuses while another purchase waits for review", async () => {
    db.payment.findFirst.mockImplementation(async ({ where }) => (where.status === "pending" ? payment() : null));
    await expect(createUsdtIntent(user, "pro", opts())).rejects.toMatchObject({ code: "PAYMENT_PENDING" });
  });

  it("refuses when USDT is not configured or every amount is taken", async () => {
    await expect(createUsdtIntent(user, "pro", opts({ env: {} }))).rejects.toMatchObject({ code: "METHOD_UNAVAILABLE" });
    db.payment.findMany.mockResolvedValue(Array.from({ length: 49 }, (_, k) => ({ amount: Number((5 + (k + 1) / 100).toFixed(2)) })));
    await expect(createUsdtIntent(user, "pro", opts())).rejects.toMatchObject({ code: "NO_AMOUNT_AVAILABLE" });
  });

  it("refuses a lower plan while a higher one is active", async () => {
    const elite = { id: "u1", tier: "elite", tierExpiresAt: new Date(now.getTime() + 5 * DAY) };
    await expect(createUsdtIntent(elite, "pro", opts())).rejects.toMatchObject({ code: "HIGHER_PLAN_ACTIVE" });
  });
});

describe("submitPayment", () => {
  const card = { tier: "pro" as const, method: "card_to_card" as const, trackingCode: RRN, paidAt: new Date(now.getTime() - DAY) };
  const usdt = { tier: "pro" as const, method: "usdt_trc20" as const, trackingCode: TX, paidAt: new Date(now.getTime() - DAY), intentId: "i1" };

  it("locks the user row and creates a pending card purchase holding the claim", async () => {
    await submitPayment(user, card, opts());
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(db.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "u1",
        amount: PAID_PLANS.pro.priceToman,
        currency: "toman",
        method: "card_to_card",
        trackingCode: RRN,
        claimCode: RRN,
        status: "pending"
      })
    });
  });

  it("accepts a reference number typed with Persian digits", async () => {
    await submitPayment(user, { ...card, trackingCode: "۱۲۳۴۵۶۷۸۹۰۱۲" }, opts());
    expect(db.payment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ trackingCode: RRN, claimCode: RRN }) });
  });

  it("moves the user's USDT reservation to pending with the lower-cased hash", async () => {
    db.payment.findFirst.mockImplementation(async ({ where }) => (where.status === "awaiting_transfer" ? intent() : null));
    await submitPayment(user, { ...usdt, trackingCode: TX.toUpperCase() }, opts());
    expect(updateManyCall().where).toEqual({ id: "i1", userId: "u1", status: "awaiting_transfer" });
    expect(updateManyCall().data).toMatchObject({ status: "pending", trackingCode: TX, claimCode: TX, paidAt: usdt.paidAt });
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it("needs a live reservation for a USDT purchase", async () => {
    await expect(submitPayment(user, { ...usdt, intentId: undefined }, opts())).rejects.toMatchObject({ code: "INTENT_REQUIRED" });
    await expect(submitPayment(user, usdt, opts())).rejects.toMatchObject({ code: "INTENT_NOT_FOUND" });
  });

  it("refuses a method the owner has not configured", async () => {
    await expect(submitPayment(user, card, opts({ env: {} }))).rejects.toMatchObject({ code: "METHOD_UNAVAILABLE" });
  });

  it("refuses a malformed tracking code or a future transfer time", async () => {
    await expect(submitPayment(user, { ...card, trackingCode: "123456" }, opts())).rejects.toMatchObject({ code: "INVALID_TRACKING_CODE" });
    await expect(submitPayment(user, { ...card, paidAt: new Date(now.getTime() + DAY) }, opts())).rejects.toMatchObject({
      code: "INVALID_PAID_AT"
    });
  });

  it("refuses a lower plan while a higher one is active", async () => {
    const elite = { id: "u1", tier: "elite", tierExpiresAt: new Date(now.getTime() + 5 * DAY) };
    await expect(submitPayment(elite, card, opts())).rejects.toMatchObject({ code: "HIGHER_PLAN_ACTIVE" });
  });

  it("allows only one pending purchase per user", async () => {
    db.payment.findFirst.mockImplementation(async ({ where }) => (where.status === "pending" ? payment() : null));
    await expect(submitPayment(user, card, opts())).rejects.toMatchObject({ code: "PAYMENT_PENDING" });
  });

  it("refuses a code that a live claim already holds", async () => {
    db.payment.findFirst.mockImplementation(async ({ where }) => (where.claimCode === RRN ? payment({ userId: "someone-else" }) : null));
    await expect(submitPayment(user, card, opts())).rejects.toMatchObject({ code: "DUPLICATE_TRACKING_CODE" });
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it("maps a racing unique-constraint failure to a duplicate", async () => {
    db.payment.create.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    await expect(submitPayment(user, card, opts())).rejects.toMatchObject({ code: "DUPLICATE_TRACKING_CODE" });
  });
});

describe("listPaymentsForAdmin", () => {
  it("requires admin access", async () => {
    await expect(listPaymentsForAdmin(nonAdmin, undefined, opts())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("hides unpaid reservations from the unfiltered list", async () => {
    await listPaymentsForAdmin(admin, undefined, opts());
    expect(db.payment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: { not: "awaiting_transfer" } } }));
  });

  it("flags approved first purchases that are still refundable", async () => {
    db.payment.findMany.mockResolvedValue([
      { ...payment({ status: "approved", reviewedAt: new Date(now.getTime() - 2 * DAY), isFirstPurchase: true }), user: { email: "a@b.c" } },
      { ...payment({ id: "p2", status: "approved", reviewedAt: new Date(now.getTime() - DAY), isFirstPurchase: false }), user: null }
    ]);
    const rows = await listPaymentsForAdmin(admin, "approved", opts());
    expect(rows[0]).toMatchObject({ id: "p1", userEmail: "a@b.c", refundEligible: true });
    expect(rows[1]).toMatchObject({ id: "p2", userEmail: null, refundEligible: false });
  });
});

describe("reviewPayment", () => {
  it("requires the admin role, not just read access", async () => {
    await expect(reviewPayment(nonAdmin, "p1", "approve", undefined, opts())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(reviewPayment(readOnlyAdmin, "p1", "approve", undefined, opts())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses to let an admin review their own purchase", async () => {
    db.payment.findUnique.mockResolvedValue(payment({ userId: "admin1" }));
    await expect(reviewPayment(admin, "p1", "approve", undefined, opts())).rejects.toMatchObject({ code: "SELF_REVIEW" });
    expect(db.payment.updateMany).not.toHaveBeenCalled();
  });

  it("approves a first purchase, records it as first and activates the plan", async () => {
    await reviewPayment(admin, "p1", "approve", undefined, opts());
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(db.payment.count).toHaveBeenCalledWith({
      where: { userId: "u1", id: { not: "p1" }, status: { in: ["approved", "refunded"] } }
    });
    expect(updateManyCall()).toEqual({
      where: { id: "p1", status: "pending" },
      data: expect.objectContaining({ status: "approved", reviewedAt: now, reviewedById: "admin1", isFirstPurchase: true })
    });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { tier: "pro", tierExpiresAt: new Date(now.getTime() + 30 * DAY) }
    });
  });

  it("uses the payment as re-read after taking the lock", async () => {
    db.payment.findUnique.mockResolvedValueOnce(payment({ tier: "pro" })).mockResolvedValueOnce(payment({ tier: "elite" }));
    await reviewPayment(admin, "p1", "approve", undefined, opts());
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: expect.objectContaining({ tier: "elite" }) });
  });

  it("marks a renewal as not first", async () => {
    db.payment.count.mockResolvedValue(1);
    await reviewPayment(admin, "p1", "approve", undefined, opts());
    expect(updateManyCall().data).toMatchObject({ isFirstPurchase: false });
  });

  it("will not approve a lower plan while the user now has a higher one", async () => {
    db.user.findUnique.mockResolvedValue({ tier: "elite", tierExpiresAt: new Date(now.getTime() + 10 * DAY) });
    await expect(reviewPayment(admin, "p1", "approve", undefined, opts())).rejects.toMatchObject({ code: "HIGHER_PLAN_ACTIVE" });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("does not approve twice when another review already changed the status", async () => {
    db.payment.updateMany.mockResolvedValue({ count: 0 });
    await expect(reviewPayment(admin, "p1", "approve", undefined, opts())).rejects.toMatchObject({ code: "PAYMENT_NOT_PENDING" });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("refuses to approve a purchase whose account was deleted", async () => {
    db.payment.findUnique.mockResolvedValue(payment({ userId: null }));
    await expect(reviewPayment(admin, "p1", "approve", undefined, opts())).rejects.toMatchObject({ code: "PAYMENT_USER_DELETED" });
  });

  it("rejects a pending payment, releases its claim and leaves the tier alone", async () => {
    await reviewPayment(admin, "p1", "reject", "No matching transfer", opts());
    expect(updateManyCall()).toEqual({
      where: { id: "p1", status: "pending" },
      data: expect.objectContaining({ status: "rejected", reviewNote: "No matching transfer", claimCode: null })
    });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("refunds a first purchase without overwriting its approval, keeping later paid days", async () => {
    const approvedAt = new Date(now.getTime() - DAY);
    db.payment.findUnique.mockResolvedValue(payment({ status: "approved", reviewedAt: approvedAt, isFirstPurchase: true }));
    db.user.findUnique.mockResolvedValue({ tier: "pro", tierExpiresAt: new Date(now.getTime() + 57 * DAY) });
    await reviewPayment(admin, "p1", "refund", undefined, opts());
    expect(updateManyCall().where).toEqual({ id: "p1", status: "approved" });
    expect(updateManyCall().data).toMatchObject({ status: "refunded", refundedAt: now, refundedById: "admin1" });
    expect(updateManyCall().data).not.toHaveProperty("reviewedAt");
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { tier: "pro", tierExpiresAt: new Date(now.getTime() + 27 * DAY) }
    });
  });

  it("refuses a refund that is not an eligible first purchase", async () => {
    db.payment.findUnique.mockResolvedValue(payment({ status: "approved", reviewedAt: new Date(now.getTime() - DAY), isFirstPurchase: false }));
    await expect(reviewPayment(admin, "p1", "refund", undefined, opts())).rejects.toMatchObject({ code: "REFUND_NOT_ELIGIBLE" });
    db.payment.findUnique.mockResolvedValue(payment({ status: "approved", reviewedAt: new Date(now.getTime() - 9 * DAY), isFirstPurchase: true }));
    await expect(reviewPayment(admin, "p1", "refund", undefined, opts())).rejects.toMatchObject({ code: "REFUND_NOT_ELIGIBLE" });
  });
});
