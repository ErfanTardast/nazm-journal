import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { analyzeNews } from "@/lib/services/news";
import { newsAnalyzeSchema } from "@/lib/validation/trading";

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "news:analyze", 40, 60);
    const user = await requireUser();
    const input = await readJson(request, newsAnalyzeSchema);
    const analysis = await analyzeNews(user.id, input);
    await auditLog({ userId: user.id, action: "news.analyze", entity: "NewsAnalysis", request });
    return ok({ analysis });
  });
}

