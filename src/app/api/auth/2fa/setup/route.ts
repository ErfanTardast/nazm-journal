import { AppError } from "@/lib/api/errors";
import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { generateTotpSecret, makeOtpAuthUrl, verifyTotpCode } from "@/lib/security/totp";
import { totpVerifySchema } from "@/lib/validation/auth";

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "auth:2fa-setup", 5, 60);
    const user = await requireUser();
    // Setup replaces the secret and switches the factor off until verified, so while it is on this needs a current
    // code too (as disable does): a stolen session alone must not remove or take over the second factor.
    if (user.twoFactorEnabled) {
      const input = await readJson(request, totpVerifySchema);
      if (!user.twoFactorSecret || !verifyTotpCode(user.twoFactorSecret, input.code)) {
        throw new AppError("INVALID_TOTP_CODE", "Invalid two-factor authentication code", 400);
      }
    }
    const secret = generateTotpSecret();

    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorSecret: secret,
        twoFactorEnabled: false
      }
    });
    await auditLog({ userId: user.id, action: "auth.2fa.setup", entity: "User", entityId: user.id, request });

    return ok({
      secret,
      otpAuthUrl: makeOtpAuthUrl(user.email, secret)
    });
  });
}
