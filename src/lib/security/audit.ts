import { prisma } from "@/lib/db/prisma";
import { clientIp } from "@/lib/security/client-ip";

type AuditInput = {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: unknown;
  request?: Request;
};

export async function auditLog(input: AuditInput) {
  const userAgent = input.request?.headers.get("user-agent") ?? undefined;
  const ipAddress = (input.request && clientIp(input.request)) ?? undefined;

  await prisma.auditLog.create({
    data: {
      userId: input.userId ?? undefined,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? undefined,
      metadata: input.metadata === undefined ? undefined : (input.metadata as object),
      ipAddress,
      userAgent
    }
  });
}

