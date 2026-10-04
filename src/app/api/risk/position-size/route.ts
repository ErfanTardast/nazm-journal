import { BODY_LIMITS } from "@/lib/api/body-limits";
import { ok, readJson, routeHandler } from "@/lib/api/response";
import { calculatePositionSize } from "@/lib/calculations/risk";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { positionSizeSchema } from "@/lib/validation/trading";

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "risk:position-size", 120, 60);
    const input = await readJson(request, positionSizeSchema, { maxBytes: BODY_LIMITS.calculator });
    return ok({ result: calculatePositionSize(input) });
  });
}

