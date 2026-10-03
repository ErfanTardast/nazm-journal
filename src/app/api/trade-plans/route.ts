import { readId } from "@/lib/api/request";
import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { createTradePlan, deleteTradePlan, listTradePlans, updateTradePlan } from "@/lib/services/trade-plans";
import { tradePlanCreateSchema, tradePlanUpdateSchema } from "@/lib/validation/trading";

export async function GET() {
  return routeHandler(async () => {
    const user = await requireUser();
    return ok({ tradePlans: await listTradePlans(user.id) });
  });
}

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "trade-plans:create", 60, 60);
    const user = await requireUser();
    const input = await readJson(request, tradePlanCreateSchema);
    const tradePlan = await createTradePlan(user.id, input);
    await auditLog({ userId: user.id, action: "trade_plan.create", entity: "TradePlan", entityId: tradePlan.id, request });
    return ok({ tradePlan }, { status: 201 });
  });
}

export async function PATCH(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "trade-plans:update", 80, 60);
    const user = await requireUser();
    const input = await readJson(request, tradePlanUpdateSchema);
    const tradePlan = await updateTradePlan(user.id, input);
    await auditLog({ userId: user.id, action: "trade_plan.update", entity: "TradePlan", entityId: tradePlan.id, request });
    return ok({ tradePlan });
  });
}

export async function DELETE(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "trade-plans:delete", 40, 60);
    const user = await requireUser();
    const id = await readId(request);
    const result = await deleteTradePlan(user.id, id);
    await auditLog({ userId: user.id, action: "trade_plan.delete", entity: "TradePlan", entityId: id, request });
    return ok(result);
  });
}

