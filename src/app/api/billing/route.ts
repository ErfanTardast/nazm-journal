import { requirePaymentsEnabled } from "@/lib/billing/enabled";
import { ok, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { getBillingOverview } from "@/lib/services/billing";

/** Current plan, prices, open transfer methods and the user's own submissions. */
export async function GET() {
  return routeHandler(async () => {
    requirePaymentsEnabled();
    const user = await requireUser();
    return ok(await getBillingOverview(user));
  });
}
