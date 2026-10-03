import { ok, readJson, routeHandler } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { isLocale } from "@/lib/i18n/locales";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { resolveGeneratedLocale } from "@/lib/services/locale";
import { getSampleWorkspaceState, loadSampleWorkspace, removeSampleWorkspace } from "@/lib/services/sample-workspace";
import { generatedTextLocaleBodySchema } from "@/lib/validation/trading";

/** The language of the page that sent the request ("/fa/onboarding" -> "fa"), for a caller that did not say. */
function localeOfReferringPage(request: Request) {
  try {
    const first = new URL(request.headers.get("referer") ?? "").pathname.split("/")[1];
    return isLocale(first) ? first : undefined;
  } catch {
    return undefined;
  }
}

/** Whether sample data is loaded, and whether this account may load it. */
export async function GET(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "sample-workspace:state", 120, 60);
    const user = await requireUser();
    return ok(await getSampleWorkspaceState(user.id));
  });
}

/**
 * Loads the labelled sample workspace into an account with no trade of its own (409 SAMPLE_NOT_EMPTY otherwise). The
 * body is optional: `{ locale }` is the language of the screen; without it the language of the page that asked, then
 * the language saved in Settings, decides what the sample is written in. Loading twice changes nothing.
 */
export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "sample-workspace:load", 10, 60);
    const user = await requireUser();
    const input = await readJson(request, generatedTextLocaleBodySchema);
    const locale = resolveGeneratedLocale(input.locale ?? localeOfReferringPage(request), user.locale);
    const result = await loadSampleWorkspace(user.id, locale);
    if (result.created) {
      await auditLog({ userId: user.id, action: "sample_workspace.load", entity: "SampleWorkspace", entityId: user.id, metadata: { counts: result.counts }, request });
    }
    return ok({ active: true, loadedAt: result.loadedAt.toISOString(), counts: result.counts }, { status: result.created ? 201 : 200 });
  });
}

/** Removes the sample rows of this account, and nothing else. Nothing loaded: the same answer, with zeros. */
export async function DELETE(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "sample-workspace:remove", 10, 60);
    const user = await requireUser();
    const { wasActive, removed } = await removeSampleWorkspace(user.id);
    if (wasActive || Object.values(removed).some((count) => count > 0)) {
      await auditLog({ userId: user.id, action: "sample_workspace.remove", entity: "SampleWorkspace", entityId: user.id, metadata: { removed }, request });
    }
    return ok({ active: false, removed });
  });
}
