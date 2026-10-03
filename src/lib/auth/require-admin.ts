import { forbidden } from "@/lib/api/errors";
import { hasRole } from "@/lib/auth/rbac";
import { requireUser } from "@/lib/auth/session";

/** Owner-only routes: 401 when signed out, 403 for a signed-in user without the admin role. */
export async function requireAdminUser() {
  const user = await requireUser();
  if (!hasRole(user, "admin")) {
    throw forbidden("Admin access is required");
  }
  return user;
}
