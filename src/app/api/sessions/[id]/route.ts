import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { endSession } from "@/lib/services/sessions";
import { sessionEndSchema } from "@/lib/validation/trading";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "sessions:end", 20, 60);
    const user = await requireUser();
    const { id } = await context.params;
    const input = await readJson(request, sessionEndSchema);
    const session = await endSession(user.id, id, input);
    await auditLog({ userId: user.id, action: "session.end", entity: "TradingSession", entityId: id, request });
    return ok({ session });
  });
}
