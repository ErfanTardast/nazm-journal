import { z } from "zod";
import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getAiProvider } from "@/lib/services/ai";
import { resolveGeneratedLocale } from "@/lib/services/locale";
import { generatedTextLocaleSchema } from "@/lib/validation/trading";

const schema = z.object({
  strategyId: z.string().optional(),
  mode: z.enum(["professional_coach", "learning"]).default("professional_coach"),
  locale: generatedTextLocaleSchema.optional()
});

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "ai:strategy-review", 20, 60);
    const user = await requireUser();
    const input = await readJson(request, schema);
    const review = await getAiProvider().strategyReview(user.id, input.strategyId, input.mode, resolveGeneratedLocale(input.locale, user.locale));
    await prisma.aiReview.create({
      data: { userId: user.id, mode: input.mode, workflow: "strategy-review", subjectId: input.strategyId, input, output: review, disclaimer: review.disclaimer }
    });
    await auditLog({ userId: user.id, action: "ai.strategy_review", entity: "AiReview", entityId: input.strategyId, request });
    return ok({ review });
  });
}

