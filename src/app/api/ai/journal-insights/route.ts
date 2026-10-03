import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getAiProvider } from "@/lib/services/ai";
import { resolveGeneratedLocale } from "@/lib/services/locale";
import { aiModeSchema } from "@/lib/validation/trading";

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "ai:journal-insights", 20, 60);
    const user = await requireUser();
    const input = await readJson(request, aiModeSchema);
    const insights = await getAiProvider().journalInsights(user.id, resolveGeneratedLocale(input.locale, user.locale));
    await auditLog({ userId: user.id, action: "ai.journal_insights", entity: "AiReview", request });
    return ok({ insights });
  });
}

