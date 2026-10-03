import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { listSessions, startSession } from "@/lib/services/sessions";
import { sessionCreateSchema } from "@/lib/validation/trading";

export async function GET() {
  return routeHandler(async () => {
    const user = await requireUser();
    return ok({ sessions: await listSessions(user.id) });
  });
}

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "sessions:create", 20, 60);
    const user = await requireUser();
    const input = await readJson(request, sessionCreateSchema);
    const session = await startSession(user.id, input);
    await auditLog({ userId: user.id, action: "session.start", entity: "TradingSession", entityId: session.id, request });
    return ok({ session }, { status: 201 });
  });
}
