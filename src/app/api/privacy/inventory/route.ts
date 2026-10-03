import { ok, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { paymentsEnabled } from "@/lib/billing/enabled";
import { DATA_CATEGORIES, exportableCategories } from "@/lib/privacy/data-inventory";

/** Read-only privacy transparency: what data the app stores + what an export covers. GET only. */
export async function GET(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "privacy:inventory", 30, 60);
    await requireUser();
    // No payment records exist while payments are off (the trial), so don't list them.
    const shown = (key: string) => key !== "payments" || paymentsEnabled();
    return ok({
      categories: DATA_CATEGORIES.filter((c) => shown(c.key)),
      exportable: exportableCategories()
        .map((c) => c.key)
        .filter(shown)
    });
  });
}
