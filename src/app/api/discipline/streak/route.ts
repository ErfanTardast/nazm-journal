import { ok, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getDisciplineStreak } from "@/lib/services/discipline-streak";

/** Read-only discipline streak (consecutive rule-following trading days). GET only; no mutation. */
export async function GET(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "discipline:streak", 30, 60);
    const user = await requireUser();
    return ok(await getDisciplineStreak(user.id));
  });
}
