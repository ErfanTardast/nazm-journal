import { ok, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { getTradeMetrics } from "@/lib/services/trades";

export async function GET() {
  return routeHandler(async () => {
    const user = await requireUser();
    return ok({ metrics: await getTradeMetrics(user.id) });
  });
}

