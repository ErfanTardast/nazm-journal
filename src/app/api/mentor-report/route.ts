import { ok, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { paymentsEnabled } from "@/lib/billing/enabled";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { effectiveTier, hasFeature } from "@/lib/entitlements";
import { resolveGeneratedLocale } from "@/lib/services/locale";
import { getMentorReport } from "@/lib/services/mentor-report";

/**
 * Read-only, entitlement-gated share-safe mentor report (GET only; no mutation).
 * The `weeklyMentorReport` feature is elite-only; lower tiers, and elite users whose
 * `tierExpiresAt` has passed, get a clear `available:false` locked response.
 * `?hidePnl=true` redacts money figures for sharing. While payments are off (the trial, where no plan can be
 * bought) the report is open to every signed-in user.
 */
export async function GET(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "mentor-report", 20, 60);
    const user = await requireUser();
    const tier = effectiveTier(user);

    if (paymentsEnabled() && !hasFeature(tier, "weeklyMentorReport")) {
      return ok({ available: false, feature: "weeklyMentorReport", requiredTier: "elite", report: null });
    }

    const searchParams = new URL(request.url).searchParams;
    const hidePnl = searchParams.get("hidePnl") === "true";
    // The report sentences follow ?locale=, else the language saved in the user's settings, else Persian.
    const locale = resolveGeneratedLocale(searchParams.get("locale"), user.locale);
    return ok({ available: true, report: await getMentorReport(user.id, { hidePnl, locale }) });
  });
}
