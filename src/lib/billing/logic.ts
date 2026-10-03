import { effectiveTier, type Tier } from "@/lib/entitlements";
import { PAID_PLANS, REFUND_WINDOW_DAYS, type PaidTier } from "@/lib/billing/plans";

const DAY_MS = 24 * 60 * 60 * 1000;
const RANK: Record<Tier, number> = { free: 0, pro: 1, elite: 2 };

type TierState = { tier: unknown; tierExpiresAt: Date | null };

/**
 * Expiry after approving a purchase: renewing the same active tier extends from its current expiry
 * (an open-ended grant of that tier stays open-ended); anything else (free, expired, or an upgrade)
 * starts a fresh period now.
 */
export function computeNewExpiry(current: TierState, purchased: PaidTier, now: Date): Date | null {
  const active = effectiveTier(current, now);
  if (active === purchased && !current.tierExpiresAt) return null;
  const base = active === purchased && current.tierExpiresAt ? current.tierExpiresAt : now;
  return new Date(base.getTime() + PAID_PLANS[purchased].periodDays * DAY_MS);
}

export type PurchaseCheck = { ok: true } | { ok: false; reason: "higher_plan_active" };

/** A lower plan cannot be bought while a higher one is still active. */
export function canPurchase(current: TierState, purchased: PaidTier, now: Date): PurchaseCheck {
  return RANK[effectiveTier(current, now)] > RANK[purchased] ? { ok: false, reason: "higher_plan_active" } : { ok: true };
}

/**
 * The 7-day guarantee covers only a first purchase (recorded as isFirstPurchase when it was approved),
 * counted from approval.
 */
export function isRefundEligible(
  payment: { status: string; reviewedAt: Date | null; isFirstPurchase: boolean },
  now: Date
): boolean {
  if (payment.status !== "approved" || !payment.reviewedAt || !payment.isFirstPurchase) return false;
  return now.getTime() - payment.reviewedAt.getTime() <= REFUND_WINDOW_DAYS * DAY_MS;
}

/**
 * The user's tier after refunding one purchase: only that purchase's period is removed, so later paid
 * days survive; free once nothing is left. Null means "leave the user unchanged" (a different tier is
 * active now, or the tier is an open-ended grant).
 */
export function tierAfterRefund(
  owner: TierState,
  refunded: { tier: string; periodDays: number },
  now: Date
): { tier: Tier; tierExpiresAt: Date | null } | null {
  if (effectiveTier(owner, now) !== refunded.tier || !owner.tierExpiresAt) return null;
  const expiry = new Date(owner.tierExpiresAt.getTime() - refunded.periodDays * DAY_MS);
  return expiry.getTime() <= now.getTime() ? { tier: "free", tierExpiresAt: null } : { tier: refunded.tier as Tier, tierExpiresAt: expiry };
}
