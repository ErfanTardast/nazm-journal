import { ok, readJson, routeHandler } from "@/lib/api/response";
import { estimateLiquidation } from "@/lib/calculations/risk";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { liquidationSchema } from "@/lib/validation/trading";

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "risk:liquidation", 120, 60);
    const input = await readJson(request, liquidationSchema);
    return ok({ result: estimateLiquidation(input) });
  });
}

