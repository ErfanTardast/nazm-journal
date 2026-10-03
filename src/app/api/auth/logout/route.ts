import { ok, routeHandler } from "@/lib/api/response";
import { clearSessionCookie, getSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { auditLog } from "@/lib/security/audit";
import { hashToken } from "@/lib/security/tokens";

export async function POST(request: Request) {
  return routeHandler(async () => {
    const token = await getSessionToken();
    if (token) {
      const tokenHash = hashToken(token);
      const session = await prisma.session.findUnique({ where: { tokenHash } });
      if (session) {
        await prisma.session.delete({ where: { id: session.id } });
        await auditLog({ userId: session.userId, action: "auth.logout", entity: "Session", entityId: session.id, request });
      }
    }

    const response = ok({ success: true });
    clearSessionCookie(response);
    return response;
  });
}

