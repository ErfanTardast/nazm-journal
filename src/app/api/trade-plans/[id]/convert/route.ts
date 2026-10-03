import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { convertTradePlan } from "@/lib/services/trade-plans";
import { tradePlanConvertSchema } from "@/lib/validation/trading";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "trade-plans:convert", 40, 60);
    const user = await requireUser();
    const { id } = await context.params;
    const input = await readJson(request, tradePlanConvertSchema);
    const result = await convertTradePlan(user.id, id, input);
    await auditLog({ userId: user.id, action: "trade_plan.convert", entity: "TradePlan", entityId: id, request });
    return ok(result, { status: 201 });
  });
}

