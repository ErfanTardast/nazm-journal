import { clientIp } from "@/lib/security/client-ip";
import { hashToken, randomToken, signCookieValue } from "@/lib/security/tokens";

/** How long a sign-in lasts. */
export const SESSION_DAYS = 30;

/**
 * A new session that is not stored yet: the row to create, and the cookie that goes with it. Sign-in stores the row
 * on its own; a password change stores it inside its transaction. Both build it here, so the lifetime and what a
 * session row records stay the same. The cookie carries the secret token; the row keeps only its hash.
 */
export function newSessionRecord(userId: string, request?: Request) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  return {
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: request?.headers.get("user-agent") ?? undefined,
      ipAddress: (request && clientIp(request)) ?? undefined
    },
    cookie: { value: signCookieValue(token), expiresAt }
  };
}
