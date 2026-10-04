import { AppError } from "@/lib/api/errors";
import { BODY_LIMITS } from "@/lib/api/body-limits";
import { ok, readJson, routeHandler } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { auditLog } from "@/lib/security/audit";
import { hashPassword } from "@/lib/security/password";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { hashToken } from "@/lib/security/tokens";
import { passwordResetConfirmSchema } from "@/lib/validation/auth";

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "auth:password-reset-confirm", 5, 60);
    const input = await readJson(request, passwordResetConfirmSchema, { maxBytes: BODY_LIMITS.auth });
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(input.token) }
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) {
      throw new AppError("INVALID_RESET_TOKEN", "The reset token is invalid or expired", 400);
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash: await hashPassword(input.password) }
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() }
      }),
      prisma.session.deleteMany({
        where: { userId: resetToken.userId }
      })
    ]);

    await auditLog({
      userId: resetToken.userId,
      action: "auth.password_reset.confirm",
      entity: "User",
      entityId: resetToken.userId,
      request
    });
    return ok({ success: true });
  });
}

