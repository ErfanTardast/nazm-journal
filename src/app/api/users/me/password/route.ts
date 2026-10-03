import { AppError } from "@/lib/api/errors";
import { ok, readJson, routeHandler } from "@/lib/api/response";
import { applySessionCookie, requireUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import {
  PASSWORD_CHANGE_WINDOW_SECONDS,
  clearPasswordChangeAttempts,
  isSharedDemoAccount,
  reservePasswordChangeAttempt,
  storeNewPassword
} from "@/lib/services/password-change";
import { passwordChangeSchema } from "@/lib/validation/auth";

export async function POST(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "users:me:password", 5, PASSWORD_CHANGE_WINDOW_SECONDS);
    const user = await requireUser();
    // Two passwords of at most 128 characters fit in far less than this; a bigger body is not read to the end.
    const input = await readJson(request, passwordChangeSchema, { maxBytes: 4096 });

    // One visitor changing the shared demo login would lock everyone else out of the demo.
    if (isSharedDemoAccount(user.email)) {
      throw new AppError("PASSWORD_CHANGE_DEMO_ACCOUNT", "The shared demo account's password cannot be changed.", 403);
    }

    // Counted before the check starts (no await in between): parallel guesses must not all see an untouched counter.
    reservePasswordChangeAttempt(user.id);
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      await auditLog({ userId: user.id, action: "auth.password_change.failed", entity: "User", entityId: user.id, request });
      throw new AppError("PASSWORD_CHANGE_CURRENT_INVALID", "The current password is not correct.", 403);
    }
    // The right password: the account gets its attempts back, whatever happens to the new one below.
    clearPasswordChangeAttempts(user.id);

    // The current password was just verified. The new one is "the same" when it is equal text, or when it matches the
    // stored hash: bcrypt reads only the first 72 bytes, so two longer passwords can differ and still be one password.
    // The second check costs one more compare, bounded by the attempt limit above.
    if (input.newPassword === input.currentPassword || (await verifyPassword(input.newPassword, user.passwordHash))) {
      throw new AppError("PASSWORD_CHANGE_SAME", "The new password must be different from the current one.", 422);
    }

    // One transaction: the new hash, every old session gone, this device's new session, the reset links used up. Once it
    // has committed the change is done, so nothing below may turn the answer into a failure.
    const session = await storeNewPassword(user.id, await hashPassword(input.newPassword), request);
    try {
      await auditLog({ userId: user.id, action: "auth.password_change", entity: "User", entityId: user.id, request });
    } catch {
      // A fixed text on purpose: nothing from the failed call is repeated in the log.
      console.error("password change: the audit entry could not be written");
    }

    const response = ok({ changed: true });
    applySessionCookie(response, session);
    return response;
  });
}
