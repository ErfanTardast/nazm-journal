import { prisma } from "@/lib/db/prisma";

// Liveness for the host's health check: the app answers, and says whether the database does (no details).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", database: "ok" });
  } catch {
    return Response.json({ status: "degraded", database: "unreachable" }, { status: 503 });
  }
}
