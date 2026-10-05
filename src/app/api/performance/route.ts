import { z } from "zod";
import { ok, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { PERIODS } from "@/lib/calculations/performance/types";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getPerformanceReport } from "@/lib/services/performance";

const querySchema = z.object({ period: z.enum(PERIODS).default("all") });

/** The performance report for one period (7d, 30d, 90d or all; all by default). It holds keys and numbers, no words. */
export async function GET(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "performance:report", 60, 60);
    const user = await requireUser();
    const { period } = querySchema.parse({ period: new URL(request.url).searchParams.get("period") ?? undefined });
    return ok({ report: await getPerformanceReport(user, { period }) });
  });
}
