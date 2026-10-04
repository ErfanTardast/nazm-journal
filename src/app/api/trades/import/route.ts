import { BODY_LIMITS } from "@/lib/api/body-limits";
import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { importTradesFromCsv } from "@/lib/services/trades";
import { csvImportSchema } from "@/lib/validation/trading";

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "trades:import", 10, 60);
    const user = await requireUser();
    const input = await readJson(request, csvImportSchema, { maxBytes: BODY_LIMITS.tradeImport });
    // The first trade the file writes removes the sample workspace first; `sampleRemoved` in the answer says when it did.
    const result = await importTradesFromCsv(user.id, input);
    await auditLog({ userId: user.id, action: "trade.import", entity: "Trade", metadata: { imported: result.imported, duplicates: result.duplicates }, request });
    return ok(result, { status: 201 });
  });
}

