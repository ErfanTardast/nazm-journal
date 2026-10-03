import { readId } from "@/lib/api/request";
import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { createStrategy, deleteStrategy, listStrategies, updateStrategy } from "@/lib/services/strategies";
import { strategyCreateSchema, strategyUpdateSchema } from "@/lib/validation/trading";

export async function GET() {
  return routeHandler(async () => {
    const user = await requireUser();
    return ok({ strategies: await listStrategies(user.id) });
  });
}

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "strategies:create", 40, 60);
    const user = await requireUser();
    const input = await readJson(request, strategyCreateSchema);
    const strategy = await createStrategy(user.id, input);
    await auditLog({ userId: user.id, action: "strategy.create", entity: "Strategy", entityId: strategy.id, request });
    return ok({ strategy }, { status: 201 });
  });
}

export async function PATCH(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "strategies:update", 60, 60);
    const user = await requireUser();
    const input = await readJson(request, strategyUpdateSchema);
    const strategy = await updateStrategy(user.id, input);
    await auditLog({ userId: user.id, action: "strategy.update", entity: "Strategy", entityId: strategy.id, request });
    return ok({ strategy });
  });
}

export async function DELETE(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "strategies:delete", 20, 60);
    const user = await requireUser();
    const id = await readId(request);
    const result = await deleteStrategy(user.id, id);
    await auditLog({ userId: user.id, action: "strategy.delete", entity: "Strategy", entityId: id, request });
    return ok(result);
  });
}

