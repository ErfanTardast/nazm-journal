import { ok, readJson, routeHandler } from "@/lib/api/response";
import { calculateForexLotSize } from "@/lib/calculations/risk";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { forexLotSchema } from "@/lib/validation/trading";

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "risk:forex-lot-size", 120, 60);
    const input = await readJson(request, forexLotSchema);
    return ok({ result: calculateForexLotSize(input) });
  });
}

