import { routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { buildExportBundle } from "@/lib/services/export";

export async function GET(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "users:export", 5, 3600);
    const user = await requireUser();
    const bundle = await buildExportBundle(user.id);
    await auditLog({ userId: user.id, action: "user.data.export", entity: "User", entityId: user.id, request });

    const filename = `nazm-export-${new Date().toISOString().slice(0, 10)}.json`;
    return new Response(JSON.stringify(bundle, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    });
  });
}
