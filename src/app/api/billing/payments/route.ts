import { requirePaymentsEnabled } from "@/lib/billing/enabled";
import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { submitPayment } from "@/lib/services/billing";
import { submitPaymentSchema } from "@/lib/validation/billing";

/** Submit a card-to-card or USDT (TRC20) transfer for manual review. The price is set server-side. */
export async function POST(request: Request) {
  return routeHandler(async () => {
    requirePaymentsEnabled();
    await enforceRateLimit(request, "billing-submit", 5, 60);
    const user = await requireUser();
    const input = await readJson(request, submitPaymentSchema);
    const payment = await submitPayment(user, input);
    await auditLog({
      userId: user.id,
      action: "payment.submit",
      entity: "Payment",
      entityId: payment.id,
      metadata: { tier: input.tier, method: input.method },
      request
    });
    return ok(payment, { status: 201 });
  });
}
