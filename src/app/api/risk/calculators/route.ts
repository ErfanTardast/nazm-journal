import { BODY_LIMITS } from "@/lib/api/body-limits";
import { ok, readJson, routeHandler } from "@/lib/api/response";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { runRiskCalculators } from "@/lib/services/risk";
import { riskCalculatorSchema } from "@/lib/validation/trading";

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "risk:calculators", 120, 60);
    const input = await readJson(request, riskCalculatorSchema, { maxBytes: BODY_LIMITS.calculator });
    return ok({ result: runRiskCalculators(input) });
  });
}

