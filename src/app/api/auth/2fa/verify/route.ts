import { AppError } from "@/lib/api/errors";
import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { verifyTotpCode } from "@/lib/security/totp";
import { totpVerifySchema } from "@/lib/validation/auth";

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "auth:2fa-verify", 10, 60);
    const user = await requireUser();
    const input = await readJson(request, totpVerifySchema);

    if (!user.twoFactorSecret || !verifyTotpCode(user.twoFactorSecret, input.code)) {
      throw new AppError("INVALID_TOTP_CODE", "Invalid two-factor authentication code", 400);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: true
      }
    });
    await auditLog({ userId: user.id, action: "auth.2fa.verify", entity: "User", entityId: user.id, request });
    return ok({ enabled: true });
  });
}

