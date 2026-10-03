import { ok, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getPlaybookAdherence } from "@/lib/services/playbook-adherence";

/** Read-only per-playbook rule adherence. GET only; no mutation. */
export async function GET(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "playbooks:adherence", 30, 60);
    const user = await requireUser();
    return ok({ playbooks: await getPlaybookAdherence(user.id) });
  });
}
