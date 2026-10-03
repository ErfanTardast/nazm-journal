import { ok, readJson, routeHandler } from "@/lib/api/response";
import { auditLog } from "@/lib/security/audit";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { recordAccessRequest, traceDroppedAccessRequest } from "@/lib/services/access-requests";
import { parseAccessRequest } from "@/lib/validation/access";

/** A valid request is under 2 KB (name 80 + note 500 characters); this leaves room for Persian text and JSON escapes. */
const MAX_BODY_BYTES = 8 * 1024;

/**
 * Public: ask for a trial invite. Every valid request, a first one, a repeat or a script that filled the hidden
 * honeypot, gets the same answer, so the endpoint cannot be used to find out which e-mails already asked. The audit
 * entry is written without the request (no IP address or user agent kept) and without the note or the e-mail. A honeypot
 * hit writes a bare "access.request_dropped" entry, so the count is visible and nothing else is.
 */
export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "access:request", 5, 60 * 60);
    const parsed = await readJson(request, { parse: parseAccessRequest }, { maxBytes: MAX_BODY_BYTES });
    if (parsed.bot) {
      // Nothing is kept, but the owner can count the dropped requests (and notice a real person whose autofill filled the
      // hidden field). The entry has no request object, entity id, metadata or field value, and at 300 a day the trace
      // stops (see traceDroppedAccessRequest). A failed write or count must not make the answer differ from a success, or
      // a script could tell the honeypot was hit.
      try {
        await traceDroppedAccessRequest();
      } catch (error) {
        console.error("audit entry for a dropped access request failed", error);
      }
    } else {
      const saved = await recordAccessRequest(parsed.data);
      await auditLog({
        action: "access.request",
        entity: "AccessRequest",
        entityId: saved.id,
        metadata: { locale: parsed.data.locale, tradingPlatform: parsed.data.tradingPlatform ?? null }
      });
    }
    return ok({ received: true });
  });
}
