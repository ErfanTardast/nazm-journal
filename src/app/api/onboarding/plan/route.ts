import { ok, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { buildOnboardingPlan } from "@/lib/onboarding/segmentation";
import { resolveGeneratedLocale } from "@/lib/services/locale";

/**
 * Read-only onboarding plan from the user's self-description (query params). GET only; no DB. The plan is written in the
 * requested `language`, else the language saved in the user's settings, else Persian.
 */
export async function GET(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "onboarding:plan", 30, 60);
    const user = await requireUser();
    const q = new URL(request.url).searchParams;
    return ok(
      buildOnboardingPlan({
        experience: q.get("experience") ?? undefined,
        market: q.get("market") ?? undefined,
        disciplineIssue: q.get("disciplineIssue") ?? undefined,
        language: resolveGeneratedLocale(q.get("language"), user.locale)
      })
    );
  });
}
