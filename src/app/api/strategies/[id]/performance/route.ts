import { ok, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { getStrategyPerformance } from "@/lib/services/strategies";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return routeHandler(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    return ok({ performance: await getStrategyPerformance(user.id, id) });
  });
}

