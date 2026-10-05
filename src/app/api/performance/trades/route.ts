import { z } from "zod";
import { ok, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { DIMENSIONS, PERIODS } from "@/lib/calculations/performance/types";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getPerformanceRowTradeIds } from "@/lib/services/performance";

// All three are needed: a row id only means something inside one period and one dimension.
const querySchema = z.object({
  period: z.enum(PERIODS),
  dimension: z.enum(DIMENSIONS),
  row: z.string().min(1).max(200)
});

/** The ids of the trades behind one row of the Performance page's breakdowns, so the journal can show just those. */
export async function GET(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "performance:trades", 60, 60);
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    const query = querySchema.parse({
      period: params.get("period") ?? undefined,
      dimension: params.get("dimension") ?? undefined,
      row: params.get("row") ?? undefined
    });
    return ok({ tradeIds: await getPerformanceRowTradeIds(user, query) });
  });
}
