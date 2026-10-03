import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getFirstRunState, saveFirstRunState } from "@/lib/services/onboarding";
import { onboardingStateInputSchema } from "@/lib/validation/onboarding";

/** The body is at most three short fields; anything bigger is not from the first-run screens. */
const MAX_BODY_BYTES = 1024;

/** Where the signed-in person stands in the first run (answers, finished or skipped, what they already have). */
export async function GET(request: Request) {
  return routeHandler(async () => {
    // The dashboard's setup card reads this on every visit, and many phones can share one address, so the limit is generous.
    await enforceRateLimit(request, "onboarding:state:read", 120, 60);
    const user = await requireUser();
    return ok({ state: await getFirstRunState(user.id) });
  });
}

/** Saves an answer and/or marks the first run done. Only the fields sent change; `done` never goes back. */
export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "onboarding:state:save", 30, 60);
    const user = await requireUser();
    const input = await readJson(request, onboardingStateInputSchema, { maxBytes: MAX_BODY_BYTES });
    const state = await saveFirstRunState(user.id, input);
    await auditLog({ userId: user.id, action: "onboarding.state.save", entity: "User", entityId: user.id, metadata: input, request });
    return ok({ state });
  });
}
