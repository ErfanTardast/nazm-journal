import { readId } from "@/lib/api/request";
import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { deleteTrade, listTrades, recordTrade, updateTrade } from "@/lib/services/trades";
import { tradeCreateSchema, tradeUpdateSchema } from "@/lib/validation/trading";

export async function GET() {
  return routeHandler(async () => {
    const user = await requireUser();
    return ok({ trades: await listTrades(user.id) });
  });
}

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "trades:create", 80, 60);
    const user = await requireUser();
    const input = await readJson(request, tradeCreateSchema);
    // A person's first trade of their own removes the sample workspace first; the answer says when it did.
    const { trade, sampleRemoved } = await recordTrade(user.id, input);
    await auditLog({ userId: user.id, action: "trade.create", entity: "Trade", entityId: String(trade.id), request });
    return ok({ trade, sampleRemoved }, { status: 201 });
  });
}

export async function PATCH(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "trades:update", 100, 60);
    const user = await requireUser();
    const input = await readJson(request, tradeUpdateSchema);
    const trade = await updateTrade(user.id, input);
    await auditLog({ userId: user.id, action: "trade.update", entity: "Trade", entityId: String(trade.id), request });
    return ok({ trade });
  });
}

export async function DELETE(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "trades:delete", 40, 60);
    const user = await requireUser();
    const id = await readId(request);
    const result = await deleteTrade(user.id, id);
    await auditLog({ userId: user.id, action: "trade.delete", entity: "Trade", entityId: id, request });
    return ok(result);
  });
}

