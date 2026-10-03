import { requirePaymentsEnabled } from "@/lib/billing/enabled";
import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { reviewPayment } from "@/lib/services/billing";
import { reviewPaymentSchema } from "@/lib/validation/billing";

/** Admin-only: approve, reject or refund one transfer. Every decision is written to the audit log. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return routeHandler(async () => {
    requirePaymentsEnabled();
    const user = await requireUser();
    const { id } = await params;
    const { action, note } = await readJson(request, reviewPaymentSchema);
    const result = await reviewPayment(user, id, action, note);
    await auditLog({
      userId: user.id,
      action: "payment.review",
      entity: "Payment",
      entityId: id,
      metadata: { action, status: result.status, note: note ?? null },
      request
    });
    return ok(result);
  });
}
