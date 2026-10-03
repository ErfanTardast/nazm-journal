import { AppError } from "@/lib/api/errors";
import { newSessionRecord } from "@/lib/auth/session-record";
import { prisma } from "@/lib/db/prisma";
import { demoModeEnabled } from "@/lib/demo";

/** The shared demo login that prisma/seed.ts creates and the login form prefills in demo mode (see src/lib/demo.ts). */
const DEMO_ACCOUNT_EMAIL = "demo@nazm.example";

/** Password checks an account may start inside one window before it is locked for the rest of it. */
export const PASSWORD_CHANGE_ATTEMPT_LIMIT = 5;
export const PASSWORD_CHANGE_WINDOW_SECONDS = 15 * 60;

type AttemptCounter = { count: number; resetAt: number };

// In-process, like the in-memory fallback of the address limiter: the rate-limit helper keys everything on the client
// address and takes no custom key, so the per-account bound lives here, keyed by user id.
const attempts = new Map<string, AttemptCounter>();

/** True for the one shared demo login, and only while demo mode is on (the seeded account does not exist otherwise). */
export function isSharedDemoAccount(email: string) {
  return demoModeEnabled() && email.trim().toLowerCase() === DEMO_ACCOUNT_EMAIL;
}

/**
 * Counts one password check against the account, or refuses (429) when the account has already used up its window.
 * Call it before the check starts and without an await in between: the check takes time, and requests that arrive while
 * it runs must already see this attempt, or a burst of parallel guesses would all be counted as the first. A wrong
 * password leaves the attempt counted; a right one gives the account its attempts back (clearPasswordChangeAttempts).
 */
export function reservePasswordChangeAttempt(userId: string) {
  const now = Date.now();
  const existing = attempts.get(userId);
  // The window starts at the first attempt and is not extended by later ones.
  const open = existing && existing.resetAt > now ? existing : null;
  const used = open?.count ?? 0;
  if (used >= PASSWORD_CHANGE_ATTEMPT_LIMIT) {
    throw new AppError("RATE_LIMITED", "Too many requests. Please try again later.", 429);
  }
  attempts.set(userId, { count: used + 1, resetAt: open?.resetAt ?? now + PASSWORD_CHANGE_WINDOW_SECONDS * 1000 });

  // Keep the map from growing without bound: drop the counters whose window is over.
  if (attempts.size > 1000) {
    for (const [id, counter] of attempts) if (counter.resetAt <= now) attempts.delete(id);
  }
}

export function clearPasswordChangeAttempts(userId: string) {
  attempts.delete(userId);
}

/**
 * Stores the new hash, ends every session of the account, starts one new session for the device that is changing the
 * password and uses up the account's open password-reset links, all in one transaction, all or nothing: a reset link
 * mailed before the change must not be able to undo it, a stolen session must not outlive it, and the person must not
 * be left signed out everywhere with a "failed" answer because the session was made in a separate step afterwards.
 *
 * Returns what `applySessionCookie` needs for the new session. The token is made and signed before anything is written,
 * so a failure there changes nothing.
 */
export async function storeNewPassword(userId: string, passwordHash: string, request: Request) {
  const session = newSessionRecord(userId, request);

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    // Before the create below, or the new session would be deleted with the old ones.
    prisma.session.deleteMany({ where: { userId } }),
    prisma.session.create({ data: session.data }),
    prisma.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } })
  ]);

  return session.cookie;
}
