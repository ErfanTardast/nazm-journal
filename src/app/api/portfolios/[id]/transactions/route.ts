import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { addPortfolioTransaction } from "@/lib/services/portfolios";
import { portfolioTransactionSchema } from "@/lib/validation/trading";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "portfolios:transaction", 80, 60);
    const user = await requireUser();
    const { id } = await context.params;
    const input = await readJson(request, portfolioTransactionSchema);
    const result = await addPortfolioTransaction(user.id, id, input);
    await auditLog({
      userId: user.id,
      action: "portfolio.transaction.create",
      entity: "Portfolio",
      entityId: id,
      metadata: { symbol: input.symbol, quantity: input.quantity },
      request
    });
    return ok(result, { status: 201 });
  });
}

