import { ok, readJson, routeHandler } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { hashToken, randomToken } from "@/lib/security/tokens";
import { passwordResetRequestSchema } from "@/lib/validation/auth";

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "auth:password-reset", 5, 60);
    const input = await readJson(request, passwordResetRequestSchema);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    let devToken: string | undefined;

    if (user) {
      const token = randomToken(32);
      devToken = token;
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000)
        }
      });
      await auditLog({ userId: user.id, action: "auth.password_reset.request", entity: "PasswordResetToken", request });
    }

    return ok({
      message: "If an account exists for this email, a reset token has been created.",
      devToken: process.env.NODE_ENV === "production" ? undefined : devToken
    });
  });
}

