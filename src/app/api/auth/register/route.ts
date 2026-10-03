import { AppError } from "@/lib/api/errors";
import { ok, readJson, routeHandler } from "@/lib/api/response";
import { isAdminEmail } from "@/lib/auth/admin-bootstrap";
import { createSession, applySessionCookie, publicUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { auditLog } from "@/lib/security/audit";
import { hashPassword } from "@/lib/security/password";
import { hashToken } from "@/lib/security/tokens";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { registerSchema } from "@/lib/validation/auth";

/**
 * While REGISTRATION_INVITE_CODE is set only people given the code can sign up (compared as hashes). In production a
 * missing or blank code keeps sign-up closed (a forgotten variable must not open it); REGISTRATION_OPEN=true opens it.
 */
function requireInvite(given: string | undefined) {
  const expected = process.env.REGISTRATION_INVITE_CODE?.trim();
  if (!expected) {
    if (process.env.NODE_ENV === "production" && process.env.REGISTRATION_OPEN !== "true") {
      throw new AppError("REGISTRATION_CLOSED", "Sign-up is closed", 403);
    }
    return;
  }
  if (!given || hashToken(given.trim()) !== hashToken(expected)) {
    throw new AppError("INVITE_REQUIRED", "A valid invite code is needed to sign up during the trial", 403);
  }
}

/** One error for "this address cannot be registered", so a taken address and a reserved one look the same. */
const emailAlreadyExists = () => new AppError("EMAIL_ALREADY_EXISTS", "An account with this email already exists", 409);

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "auth:register", 5, 60);
    const input = await readJson(request, registerSchema);
    requireInvite(input.inviteCode);

    // Registering never grants a role. An address listed in ADMIN_EMAILS is reserved for the owner: until it has an
    // account (made while the variable was empty) it is refused exactly like a taken address, because e-mails are not
    // verified and the invite code is shared, so anyone with the code could otherwise register it first. The admin role
    // is attached at sign-in only (see ensureAdminRole in the login route). The lookup runs first and the decision is
    // made once, so a listed address costs the same as a taken one and response time does not tell them apart.
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing || isAdminEmail(input.email)) throw emailAlreadyExists();

    const traderRole = await prisma.role.upsert({
      where: { name: "trader" },
      update: {},
      create: { name: "trader", description: "Standard trader account" }
    });

    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: await hashPassword(input.password),
        ...(input.locale ? { locale: input.locale } : {}),
        roles: {
          create: {
            roleId: traderRole.id
          }
        },
        riskProfile: {
          create: {
            accountSize: 10000,
            riskPerTradePct: 1,
            maxDailyRiskPct: 3,
            maxWeeklyRiskPct: 6,
            maxOpenRiskPct: 5,
            rules: {
              requireChecklistBeforeEntry: true,
              avoidTradingDuringHighImpactNews: true
            }
          }
        }
      },
      include: {
        roles: {
          include: {
            role: true
          }
        }
      }
    });

    await auditLog({ userId: user.id, action: "auth.register", entity: "User", entityId: user.id, request });
    const session = await createSession(user.id, request);
    const response = ok({ user: publicUser(user) }, { status: 201 });
    applySessionCookie(response, session);
    return response;
  });
}
