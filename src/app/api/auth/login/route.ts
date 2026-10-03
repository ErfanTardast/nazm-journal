import { AppError } from "@/lib/api/errors";
import { ok, readJson, routeHandler } from "@/lib/api/response";
import { ADMIN_ROLE, ensureAdminRole } from "@/lib/auth/admin-bootstrap";
import { applySessionCookie, createSession, publicUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { auditLog } from "@/lib/security/audit";
import { verifyPassword } from "@/lib/security/password";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { verifyTotpCode } from "@/lib/security/totp";
import { loginSchema } from "@/lib/validation/auth";

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "auth:login", 10, 60);
    const input = await readJson(request, loginSchema);
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: {
        roles: {
          include: {
            role: true
          }
        }
      }
    });

    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new AppError("INVALID_CREDENTIALS", "Invalid email or password", 401);
    }

    if (user.twoFactorEnabled) {
      if (!input.totpCode || !user.twoFactorSecret || !verifyTotpCode(user.twoFactorSecret, input.totpCode)) {
        throw new AppError("TWO_FACTOR_REQUIRED", "A valid two-factor authentication code is required", 401);
      }
    }

    // The owner's account (ADMIN_EMAILS) gets the admin role here, after the password and any 2FA code were checked.
    const grantedAdmin = await ensureAdminRole(user);
    if (grantedAdmin) await auditLog({ userId: user.id, action: "auth.admin_bootstrap", entity: "User", entityId: user.id, request });

    await auditLog({ userId: user.id, action: "auth.login", entity: "Session", request });
    const session = await createSession(user.id, request);
    const response = ok({
      user: publicUser(grantedAdmin ? { ...user, roles: [...user.roles, { role: { name: ADMIN_ROLE } }] } : user)
    });
    applySessionCookie(response, session);
    return response;
  });
}

