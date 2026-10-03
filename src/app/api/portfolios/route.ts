import { readId } from "@/lib/api/request";
import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { createPortfolio, deletePortfolio, listPortfolios, updatePortfolio } from "@/lib/services/portfolios";
import { portfolioCreateSchema, portfolioUpdateSchema } from "@/lib/validation/trading";

export async function GET() {
  return routeHandler(async () => {
    const user = await requireUser();
    return ok({ portfolios: await listPortfolios(user.id) });
  });
}

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "portfolios:create", 40, 60);
    const user = await requireUser();
    const input = await readJson(request, portfolioCreateSchema);
    const portfolio = await createPortfolio(user.id, input);
    await auditLog({ userId: user.id, action: "portfolio.create", entity: "Portfolio", entityId: String(portfolio.id), request });
    return ok({ portfolio }, { status: 201 });
  });
}

export async function PATCH(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "portfolios:update", 60, 60);
    const user = await requireUser();
    const input = await readJson(request, portfolioUpdateSchema);
    const portfolio = await updatePortfolio(user.id, input);
    await auditLog({ userId: user.id, action: "portfolio.update", entity: "Portfolio", entityId: String(portfolio.id), request });
    return ok({ portfolio });
  });
}

export async function DELETE(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "portfolios:delete", 20, 60);
    const user = await requireUser();
    const id = await readId(request);
    const result = await deletePortfolio(user.id, id);
    await auditLog({ userId: user.id, action: "portfolio.delete", entity: "Portfolio", entityId: id, request });
    return ok(result);
  });
}

