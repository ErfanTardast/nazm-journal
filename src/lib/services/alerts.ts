import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { notFound } from "@/lib/api/errors";
import type { z } from "zod";
import type { alertCreateSchema, alertUpdateSchema } from "@/lib/validation/trading";

export async function listAlerts(userId: string) {
  return prisma.alert.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" }
  });
}

export async function createAlert(userId: string, input: z.infer<typeof alertCreateSchema>) {
  return prisma.alert.create({
    data: {
      userId,
      type: input.type,
      status: input.status,
      symbol: input.symbol ?? undefined,
      condition: input.condition as Prisma.InputJsonValue,
      message: input.message,
      channels: input.channels
    }
  });
}

export async function updateAlert(userId: string, input: z.infer<typeof alertUpdateSchema>) {
  const existing = await prisma.alert.findFirst({ where: { id: input.id, userId } });
  if (!existing) {
    throw notFound("Alert not found");
  }

  return prisma.alert.update({
    where: { id: input.id },
    data: {
      type: input.type,
      status: input.status,
      symbol: input.symbol ?? undefined,
      condition: input.condition as Prisma.InputJsonValue | undefined,
      message: input.message,
      channels: input.channels
    }
  });
}

export async function deleteAlert(userId: string, id: string) {
  const existing = await prisma.alert.findFirst({ where: { id, userId } });
  if (!existing) {
    throw notFound("Alert not found");
  }
  await prisma.alert.delete({ where: { id } });
  return { deleted: true };
}
