import type { PrismaClient } from "@prisma/client";
import { AppError, forbidden, notFound } from "@/lib/api/errors";
import { hasPermission, hasRole, type PermissionUser } from "@/lib/auth/rbac";
import { canPurchase, computeNewExpiry, isRefundEligible, tierAfterRefund } from "@/lib/billing/logic";
import {
  getCardDetails,
  getUsdtWallet,
  isValidTrackingCode,
  normalizeTrackingCode,
  PAID_PLANS,
  quote,
  REFUND_WINDOW_DAYS,
  reserveUsdtAmount,
  USDT_INTENT_TTL_HOURS,
  type BillingEnv,
  type PaidTier,
  type PaymentMethod
} from "@/lib/billing/plans";
import { isUniqueViolation } from "@/lib/db/errors";
import { prisma } from "@/lib/db/prisma";
import { effectiveTier } from "@/lib/entitlements";

type BillingTx = Pick<PrismaClient, "payment" | "user" | "$queryRaw">;
type BillingDb = BillingTx & Pick<PrismaClient, "$transaction">;
type Options = { env?: BillingEnv; now?: Date; db?: BillingDb };
type BillingUser = { id: string; tier?: unknown; tierExpiresAt?: Date | null };
type Admin = PermissionUser & { id: string };

export type PaymentStatus = "awaiting_transfer" | "pending" | "approved" | "rejected" | "refunded";
export type ReviewAction = "approve" | "reject" | "refund";

type PaymentRow = {
  id: string;
  userId: string | null;
  tier: string;
  periodDays: number;
  amount: unknown;
  currency: string;
  method: string;
  trackingCode: string | null;
  paidAt: Date | null;
  status: string;
  reviewedAt: Date | null;
  reviewNote: string | null;
  isFirstPurchase: boolean;
  refundedAt: Date | null;
  createdAt: Date;
};

const HOUR_MS = 60 * 60 * 1000;

function toNumber(amount: unknown) {
  return Number(String(amount));
}

function serializePayment(p: PaymentRow) {
  return {
    id: p.id,
    tier: p.tier,
    periodDays: p.periodDays,
    amount: toNumber(p.amount),
    currency: p.currency,
    method: p.method,
    trackingCode: p.trackingCode,
    paidAt: p.paidAt?.toISOString() ?? null,
    status: p.status,
    reviewedAt: p.reviewedAt?.toISOString() ?? null,
    reviewNote: p.reviewNote,
    refundedAt: p.refundedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString()
  };
}

function serializeIntent(p: PaymentRow) {
  return {
    id: p.id,
    tier: p.tier,
    amount: toNumber(p.amount),
    expiresAt: new Date(p.createdAt.getTime() + USDT_INTENT_TTL_HOURS * HOUR_MS).toISOString()
  };
}

function intentCutoff(now: Date) {
  return new Date(now.getTime() - USDT_INTENT_TTL_HOURS * HOUR_MS);
}

/** Listing is allowed for admin readers; changing tiers and money records needs the admin role. */
function requireAdminReader(user: PermissionUser) {
  if (!hasRole(user, "admin") && !hasPermission(user, "admin:read")) throw forbidden("Admin access is required");
}

function requireAdminRole(user: PermissionUser) {
  if (!hasRole(user, "admin")) throw forbidden("The admin role is required to review payments");
}

/** Serializes concurrent submissions and reviews for one user (Postgres row lock inside the transaction). */
async function lockUser(tx: BillingTx, userId: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
}

function tierState(user: { tier?: unknown; tierExpiresAt?: Date | null }) {
  return { tier: user.tier, tierExpiresAt: user.tierExpiresAt ?? null };
}

function assertCanPurchase(user: { tier?: unknown; tierExpiresAt?: Date | null }, tier: PaidTier, now: Date) {
  if (!canPurchase(tierState(user), tier, now).ok) throw new AppError("HIGHER_PLAN_ACTIVE", "A higher plan is still active", 409);
}

async function assertNoPending(tx: BillingTx, userId: string) {
  const pending = await tx.payment.findFirst({ where: { userId, status: "pending" } });
  if (pending) throw new AppError("PAYMENT_PENDING", "You already have a payment waiting for review", 409);
}

function duplicate() {
  return new AppError("DUPLICATE_TRACKING_CODE", "This reference number or transaction hash was already submitted", 409);
}

export async function getBillingOverview(
  user: BillingUser,
  { env = process.env as BillingEnv, now = new Date(), db = prisma }: Options = {}
) {
  const usdt = getUsdtWallet(env);
  const [payments, intent] = await Promise.all([
    db.payment.findMany({ where: { userId: user.id, status: { not: "awaiting_transfer" } }, orderBy: { createdAt: "desc" }, take: 20 }),
    usdt
      ? db.payment.findFirst({ where: { userId: user.id, status: "awaiting_transfer", createdAt: { gt: intentCutoff(now) } } })
      : Promise.resolve(null)
  ]);
  return {
    tier: effectiveTier(tierState(user), now),
    tierExpiresAt: user.tierExpiresAt?.toISOString() ?? null,
    plans: PAID_PLANS,
    refundWindowDays: REFUND_WINDOW_DAYS,
    methods: { card: getCardDetails(env), usdt },
    usdtIntent: intent ? serializeIntent(intent as PaymentRow) : null,
    payments: (payments as PaymentRow[]).map(serializePayment)
  };
}

/**
 * Reserve this user's exact USDT amount for a plan before they transfer. Reuses their open reservation
 * for the same plan; switching plan re-reserves. Amounts are unique among live reservations and
 * submitted-but-unreviewed USDT purchases.
 */
export async function createUsdtIntent(
  user: BillingUser,
  tier: PaidTier,
  { env = process.env as BillingEnv, now = new Date(), db = prisma }: Options = {}
) {
  if (!getUsdtWallet(env)) throw new AppError("METHOD_UNAVAILABLE", "This payment method is not open yet", 409);
  assertCanPurchase(user, tier, now);
  const cutoff = intentCutoff(now);

  return db.$transaction(async (tx) => {
    await lockUser(tx, user.id);
    await assertNoPending(tx, user.id);

    const existing = (await tx.payment.findFirst({
      where: { userId: user.id, status: "awaiting_transfer", createdAt: { gt: cutoff } }
    })) as PaymentRow | null;
    if (existing && existing.tier === tier) return serializeIntent(existing);

    const open = (await tx.payment.findMany({
      where: { method: "usdt_trc20", OR: [{ status: "awaiting_transfer", createdAt: { gt: cutoff } }, { status: "pending" }] },
      select: { id: true, amount: true }
    })) as { id?: string; amount: unknown }[];
    const taken = open.filter((row) => !existing || row.id !== existing.id).map((row) => toNumber(row.amount));
    const amount = reserveUsdtAmount(tier, taken);
    if (amount === null) throw new AppError("NO_AMOUNT_AVAILABLE", "Too many USDT purchases are open right now; try again later", 409);

    const data = { tier, periodDays: PAID_PLANS[tier].periodDays, amount, createdAt: now };
    const row = existing
      ? await tx.payment.update({ where: { id: existing.id }, data })
      : await tx.payment.create({
          data: { ...data, userId: user.id, currency: "usdt", method: "usdt_trc20", status: "awaiting_transfer" }
        });
    return serializeIntent(row as PaymentRow);
  });
}

export type SubmitPaymentInput = {
  tier: PaidTier;
  method: PaymentMethod;
  trackingCode: string;
  paidAt: Date;
  intentId?: string;
};

export async function submitPayment(
  user: BillingUser,
  input: SubmitPaymentInput,
  { env = process.env as BillingEnv, now = new Date(), db = prisma }: Options = {}
) {
  const destination = input.method === "usdt_trc20" ? getUsdtWallet(env) : getCardDetails(env);
  if (!destination) throw new AppError("METHOD_UNAVAILABLE", "This payment method is not open yet", 409);

  const trackingCode = normalizeTrackingCode(input.method, input.trackingCode);
  if (!isValidTrackingCode(input.method, trackingCode)) {
    throw new AppError("INVALID_TRACKING_CODE", "The reference number or transaction hash is not in the expected format", 422);
  }
  if (input.paidAt.getTime() > now.getTime()) throw new AppError("INVALID_PAID_AT", "The payment time cannot be in the future", 422);
  if (input.method === "usdt_trc20" && !input.intentId) {
    throw new AppError("INTENT_REQUIRED", "Get your exact USDT amount before reporting the transfer", 422);
  }
  if (input.method === "card_to_card") assertCanPurchase(user, input.tier, now);

  return db.$transaction(async (tx) => {
    await lockUser(tx, user.id);
    await assertNoPending(tx, user.id);

    // Rejected claims have claimCode = null, so only live claims block the code.
    const claimed = await tx.payment.findFirst({ where: { method: input.method, claimCode: trackingCode } });
    if (claimed) throw duplicate();

    try {
      if (input.method === "card_to_card") {
        const { amount, currency } = quote(input.tier, "card_to_card");
        const created = await tx.payment.create({
          data: {
            userId: user.id,
            tier: input.tier,
            periodDays: PAID_PLANS[input.tier].periodDays,
            amount,
            currency,
            method: "card_to_card",
            trackingCode,
            claimCode: trackingCode,
            paidAt: input.paidAt,
            status: "pending"
          }
        });
        return serializePayment(created as PaymentRow);
      }

      const intent = (await tx.payment.findFirst({
        where: { id: input.intentId, userId: user.id, status: "awaiting_transfer", createdAt: { gt: intentCutoff(now) } }
      })) as PaymentRow | null;
      if (!intent) throw new AppError("INTENT_NOT_FOUND", "Your USDT reservation expired; get a new exact amount", 409);
      assertCanPurchase(user, intent.tier as PaidTier, now);

      const moved = await tx.payment.updateMany({
        where: { id: intent.id, userId: user.id, status: "awaiting_transfer" },
        data: { status: "pending", trackingCode, claimCode: trackingCode, paidAt: input.paidAt }
      });
      if (moved.count !== 1) throw new AppError("INTENT_NOT_FOUND", "Your USDT reservation expired; get a new exact amount", 409);
      return serializePayment({ ...intent, status: "pending", trackingCode, paidAt: input.paidAt });
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate();
      throw error;
    }
  });
}

export async function listPaymentsForAdmin(
  admin: PermissionUser,
  status: PaymentStatus | undefined,
  { now = new Date(), db = prisma }: Options = {}
) {
  requireAdminReader(admin);
  const rows = (await db.payment.findMany({
    where: status ? { status } : { status: { not: "awaiting_transfer" } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { email: true } } }
  })) as (PaymentRow & { user: { email: string } | null })[];

  return rows.map((row) => ({
    ...serializePayment(row),
    userEmail: row.user?.email ?? null,
    refundEligible: isRefundEligible(row, now)
  }));
}

export async function reviewPayment(
  admin: Admin,
  paymentId: string,
  action: ReviewAction,
  note: string | undefined,
  { now = new Date(), db = prisma }: Options = {}
) {
  requireAdminRole(admin);

  return db.$transaction(async (tx) => {
    const first = (await tx.payment.findUnique({ where: { id: paymentId } })) as PaymentRow | null;
    if (!first) throw notFound("Payment not found");
    if (first.userId && first.userId === admin.id) {
      throw new AppError("SELF_REVIEW", "Another admin must review your own purchase", 403);
    }
    if (first.userId) await lockUser(tx, first.userId);
    // Re-read under the lock so tier/period cannot change between the read and the decision.
    const found = (await tx.payment.findUnique({ where: { id: paymentId } })) as PaymentRow | null;
    if (!found) throw notFound("Payment not found");

    if (action === "reject") {
      await moveStatus(tx, paymentId, "pending", {
        status: "rejected",
        reviewedAt: now,
        reviewedById: admin.id,
        reviewNote: note ?? null,
        claimCode: null
      });
      return { id: paymentId, status: "rejected" as const };
    }

    if (action === "approve") {
      if (!found.userId) throw new AppError("PAYMENT_USER_DELETED", "The account for this payment was deleted", 409);
      const owner = await tx.user.findUnique({ where: { id: found.userId }, select: { tier: true, tierExpiresAt: true } });
      if (!owner) throw new AppError("PAYMENT_USER_DELETED", "The account for this payment was deleted", 409);
      const tier = found.tier as PaidTier;
      if (!canPurchase(owner, tier, now).ok) {
        throw new AppError("HIGHER_PLAN_ACTIVE", "The user now has a higher active plan; reject this payment instead", 409);
      }
      const earlier = await tx.payment.count({
        where: { userId: found.userId, id: { not: paymentId }, status: { in: ["approved", "refunded"] } }
      });
      await moveStatus(tx, paymentId, "pending", {
        status: "approved",
        reviewedAt: now,
        reviewedById: admin.id,
        reviewNote: note ?? null,
        isFirstPurchase: earlier === 0
      });
      await tx.user.update({ where: { id: found.userId }, data: { tier, tierExpiresAt: computeNewExpiry(owner, tier, now) } });
      return { id: paymentId, status: "approved" as const };
    }

    // Refund: approval fields stay untouched so the history and later eligibility checks stay correct.
    if (!isRefundEligible(found, now)) {
      throw new AppError("REFUND_NOT_ELIGIBLE", "Only a first purchase approved in the last 7 days can be refunded here", 409);
    }
    await moveStatus(tx, paymentId, "approved", { status: "refunded", refundedAt: now, refundedById: admin.id });
    if (found.userId) {
      const owner = await tx.user.findUnique({ where: { id: found.userId }, select: { tier: true, tierExpiresAt: true } });
      const next = owner ? tierAfterRefund(owner, found, now) : null;
      if (next) await tx.user.update({ where: { id: found.userId }, data: next });
    }
    return { id: paymentId, status: "refunded" as const };
  });
}

/** Status guard in the WHERE makes concurrent reviews safe: only one can move a payment out of `from`. */
async function moveStatus(tx: BillingTx, id: string, from: "pending" | "approved", data: Record<string, unknown>) {
  const updated = await tx.payment.updateMany({ where: { id, status: from }, data });
  if (updated.count !== 1) {
    throw new AppError(from === "approved" ? "REFUND_NOT_ELIGIBLE" : "PAYMENT_NOT_PENDING", "The payment was already reviewed", 409);
  }
}
