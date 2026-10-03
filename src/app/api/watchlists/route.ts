import { readId } from "@/lib/api/request";
import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { createWatchlist, deleteWatchlist, listWatchlists, updateWatchlist } from "@/lib/services/watchlists";
import { watchlistCreateSchema, watchlistUpdateSchema } from "@/lib/validation/trading";

export async function GET() {
  return routeHandler(async () => {
    const user = await requireUser();
    return ok({ watchlists: await listWatchlists(user.id) });
  });
}

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "watchlists:create", 40, 60);
    const user = await requireUser();
    const input = await readJson(request, watchlistCreateSchema);
    const watchlist = await createWatchlist(user.id, input);
    await auditLog({ userId: user.id, action: "watchlist.create", entity: "Watchlist", entityId: watchlist.id, request });
    return ok({ watchlist }, { status: 201 });
  });
}

export async function PATCH(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "watchlists:update", 60, 60);
    const user = await requireUser();
    const input = await readJson(request, watchlistUpdateSchema);
    const watchlist = await updateWatchlist(user.id, input);
    await auditLog({ userId: user.id, action: "watchlist.update", entity: "Watchlist", entityId: watchlist.id, request });
    return ok({ watchlist });
  });
}

export async function DELETE(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "watchlists:delete", 30, 60);
    const user = await requireUser();
    const id = await readId(request);
    const result = await deleteWatchlist(user.id, id);
    await auditLog({ userId: user.id, action: "watchlist.delete", entity: "Watchlist", entityId: id, request });
    return ok(result);
  });
}

