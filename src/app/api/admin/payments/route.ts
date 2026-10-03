import { requirePaymentsEnabled } from "@/lib/billing/enabled";
import { ok, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { listPaymentsForAdmin } from "@/lib/services/billing";
import { paymentStatusSchema } from "@/lib/validation/billing";

/** Admin-only list of submitted transfers; `?status=` filters, anything unknown lists all. */
export async function GET(request: Request) {
  return routeHandler(async () => {
    requirePaymentsEnabled();
    const user = await requireUser();
    const parsed = paymentStatusSchema.safeParse(new URL(request.url).searchParams.get("status"));
    return ok(await listPaymentsForAdmin(user, parsed.success ? parsed.data : undefined));
  });
}
