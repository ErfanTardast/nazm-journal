import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser, publicUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { auditLog } from "@/lib/security/audit";
import { NEW_YORK_CLOSE } from "@/lib/time/zones";
import { userSettingsSchema } from "@/lib/validation/auth";

export async function GET() {
  return routeHandler(async () => {
    const user = await requireUser();
    return ok({
      settings: {
        locale: user.locale,
        theme: user.theme,
        timezone: user.timezone,
        riskPerTradePct: Number(user.riskPerTradePct),
        maxDailyLossPct: Number(user.maxDailyLossPct),
        maxWeeklyLossPct: Number(user.maxWeeklyLossPct),
        startingBalance: user.startingBalance === null || user.startingBalance === undefined ? null : Number(user.startingBalance),
        brokerTimeZone: user.brokerTimeZone ?? NEW_YORK_CLOSE
      }
    });
  });
}

export async function PATCH(request: Request) {
  return routeHandler(async () => {
    const user = await requireUser();
    const input = await readJson(request, userSettingsSchema);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: input,
      include: {
        roles: {
          include: {
            role: true
          }
        }
      }
    });
    await auditLog({ userId: user.id, action: "user.settings.update", entity: "User", entityId: user.id, metadata: input, request });
    return ok({ user: publicUser(updated) });
  });
}

