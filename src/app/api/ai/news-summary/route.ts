import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getAiProvider } from "@/lib/services/ai";
import { resolveGeneratedLocale } from "@/lib/services/locale";
import { aiModeSchema } from "@/lib/validation/trading";

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "ai:news-summary", 20, 60);
    const user = await requireUser();
    const input = await readJson(request, aiModeSchema);
    const summary = await getAiProvider().newsSummary(user.id, input.mode, resolveGeneratedLocale(input.locale, user.locale));
    await prisma.aiReview.create({
      data: { userId: user.id, mode: input.mode, workflow: "news-summary", input, output: summary, disclaimer: summary.disclaimer }
    });
    await auditLog({ userId: user.id, action: "ai.news_summary", entity: "AiReview", request });
    return ok({ summary });
  });
}

