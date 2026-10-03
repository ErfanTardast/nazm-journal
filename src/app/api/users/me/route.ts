import { AppError } from "@/lib/api/errors";
import { ok, readJson, routeHandler } from "@/lib/api/response";
import { clearSessionCookie, requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { verifyPassword } from "@/lib/security/password";
import { deleteUserAccount } from "@/lib/services/account-deletion";
import { accountDeletionSchema } from "@/lib/validation/auth";

export async function DELETE(request: Request) {
  return routeHandler(async () => {
    await enforceRateLimit(request, "users:me:delete", 3, 3600);
    const user = await requireUser();
    const input = await readJson(request, accountDeletionSchema);

    if (input.confirmationEmail !== user.email.toLowerCase()) {
      throw new AppError("ACCOUNT_DELETE_CONFIRMATION_MISMATCH", "Confirmation email does not match this account.", 422);
    }

    if (!(await verifyPassword(input.password, user.passwordHash))) {
      throw new AppError("ACCOUNT_DELETE_PASSWORD_INVALID", "Password confirmation failed.", 403);
    }

    const preview = await deleteUserAccount(user.id);
    const response = ok({ deleted: true, preview });
    clearSessionCookie(response);
    return response;
  });
}
