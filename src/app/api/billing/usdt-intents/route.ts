import { requirePaymentsEnabled } from "@/lib/billing/enabled";
import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { createUsdtIntent } from "@/lib/services/billing";
import { usdtIntentSchema } from "@/lib/validation/billing";

/** Reserve this user's exact USDT amount for a plan before they transfer (valid for 48 hours). */
export async function POST(request: Request) {
  return routeHandler(async () => {
    requirePaymentsEnabled();
    await enforceRateLimit(request, "billing-usdt-intent", 10, 60);
    const user = await requireUser();
    const { tier } = await readJson(request, usdtIntentSchema);
    return ok(await createUsdtIntent(user, tier), { status: 201 });
  });
}
