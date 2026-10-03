import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { createBacktest, listBacktests } from "@/lib/services/backtests";
import { backtestCreateSchema } from "@/lib/validation/trading";

export async function GET() {
  return routeHandler(async () => {
    const user = await requireUser();
    return ok({ backtests: await listBacktests(user.id) });
  });
}

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "backtests:create", 30, 60);
    const user = await requireUser();
    const input = await readJson(request, backtestCreateSchema);
    const backtest = await createBacktest(user.id, input);
    await auditLog({ userId: user.id, action: "backtest.create", entity: "Backtest", entityId: backtest.id, request });
    return ok({ backtest }, { status: 201 });
  });
}

