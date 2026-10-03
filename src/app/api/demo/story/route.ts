import { notFound } from "@/lib/api/errors";
import { ok, routeHandler } from "@/lib/api/response";
import { demoModeEnabled } from "@/lib/demo";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { buildDemoStory } from "@/lib/demo/story";

/** Read-only deterministic two-week demo narrative. GET only; no mutation, no DB. */
export async function GET(request: Request) {
  return routeHandler(async () => {
    if (!demoModeEnabled()) throw notFound();
    await enforceRateLimit(request, "demo:story", 30, 60);
    await requireUser();
    return ok(buildDemoStory());
  });
}
