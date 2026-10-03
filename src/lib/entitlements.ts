/**
 * Phase Epsilon — provider-neutral entitlements (`free` / `pro` / `elite`).
 *
 * A PURE mapping from a tier to feature flags + numeric limits. It is intentionally decoupled from
 * any payment provider, billing table, or DB write: callers pass a tier (usually `effectiveTier(user)`,
 * which reads `User.tier` + `User.tierExpiresAt`) and read the resolved entitlements. Unknown /
 * missing tiers degrade safely to `free`. `-1` (UNLIMITED) means "no cap".
 */
export type Tier = "free" | "pro" | "elite";
export const TIERS: readonly Tier[] = ["free", "pro", "elite"];

export const UNLIMITED = -1;

export type EntitlementLimits = {
  maxActivePlans: number;
  maxStrategies: number;
  maxWatchlists: number;
  aiReviewsPerDay: number;
  historyRetentionDays: number;
};

export type EntitlementFeatures = {
  aiCoach: boolean;
  dataExport: boolean;
  advancedAnalytics: boolean;
  weeklyMentorReport: boolean;
};

export type Entitlements = { tier: Tier; limits: EntitlementLimits; features: EntitlementFeatures };

export const TIER_ENTITLEMENTS: Record<Tier, { limits: EntitlementLimits; features: EntitlementFeatures }> = {
  free: {
    limits: { maxActivePlans: 3, maxStrategies: 3, maxWatchlists: 1, aiReviewsPerDay: 5, historyRetentionDays: 90 },
    features: { aiCoach: true, dataExport: false, advancedAnalytics: false, weeklyMentorReport: false }
  },
  pro: {
    limits: { maxActivePlans: 25, maxStrategies: 25, maxWatchlists: 10, aiReviewsPerDay: 50, historyRetentionDays: 730 },
    features: { aiCoach: true, dataExport: true, advancedAnalytics: true, weeklyMentorReport: false }
  },
  elite: {
    limits: {
      maxActivePlans: UNLIMITED, maxStrategies: UNLIMITED, maxWatchlists: UNLIMITED,
      aiReviewsPerDay: UNLIMITED, historyRetentionDays: UNLIMITED
    },
    features: { aiCoach: true, dataExport: true, advancedAnalytics: true, weeklyMentorReport: true }
  }
};

/** Coerce an untrusted value to a known tier; unknown/missing => `free`. */
export function resolveTier(value: unknown): Tier {
  return TIERS.includes(value as Tier) ? (value as Tier) : "free";
}

/**
 * The tier a user actually gets right now: their stored `User.tier`, or `free` once
 * `tierExpiresAt` has passed. A paid tier with no expiry stays active (manual/admin grants).
 */
export function effectiveTier(user: { tier?: unknown; tierExpiresAt?: Date | null }, now: Date = new Date()): Tier {
  const tier = resolveTier(user.tier);
  if (tier !== "free" && user.tierExpiresAt && user.tierExpiresAt.getTime() <= now.getTime()) return "free";
  return tier;
}

/** Resolve full entitlements for a (possibly unknown) tier. */
export function resolveEntitlements(tier: unknown): Entitlements {
  const t = resolveTier(tier);
  return { tier: t, ...TIER_ENTITLEMENTS[t] };
}

/** Whether a tier includes a feature. */
export function hasFeature(tier: unknown, feature: keyof EntitlementFeatures): boolean {
  return resolveEntitlements(tier).features[feature];
}

export type LimitCheck = { allowed: boolean; limit: number; remaining: number; unlimited: boolean };

/** Check a numeric limit against a current count (read-only; callers supply the count). */
export function checkLimit(tier: unknown, key: keyof EntitlementLimits, currentCount: number): LimitCheck {
  const limit = resolveEntitlements(tier).limits[key];
  if (limit === UNLIMITED) {
    return { allowed: true, limit: UNLIMITED, remaining: UNLIMITED, unlimited: true };
  }
  const remaining = Math.max(0, limit - currentCount);
  return { allowed: currentCount < limit, limit, remaining, unlimited: false };
}
