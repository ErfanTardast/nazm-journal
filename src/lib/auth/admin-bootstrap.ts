import { prisma } from "@/lib/db/prisma";

export const ADMIN_ROLE = "admin";

type Env = Record<string, string | undefined>;

/**
 * The e-mails in ADMIN_EMAILS (comma-separated, any case, spaces ignored). Empty or unset means nobody. Read when called,
 * not at start-up, so a changed variable counts on the next sign-in.
 */
export function adminEmails(env: Env = process.env) {
  return new Set(
    (env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminEmail(email: string, env: Env = process.env) {
  return adminEmails(env).has(email.trim().toLowerCase());
}

/**
 * Bootstrap for the owner: the production database has no admin (the seed that creates the role is skipped there), so an
 * existing account whose e-mail is listed in ADMIN_EMAILS gets the "admin" role when it signs in. Registering never
 * grants it (the register route refuses a listed address that has no account, like a taken one), because e-mails are not
 * verified and the invite code is shared. It only ever adds the role (creating the role row if missing, leaving an
 * existing one as it is) and never removes or changes a role (clearing the variable does not revoke it: delete the
 * UserRole row), and an e-mail that is not listed gains nothing. Call it only after the person is authenticated (password
 * and any two-factor code checked). Returns true when the role was attached by this call, so the caller can put it in
 * the response.
 */
export async function ensureAdminRole(
  user: { id: string; email: string; roles?: { role: { name: string } }[] },
  env: Env = process.env
) {
  if (!isAdminEmail(user.email, env)) return false;
  if (user.roles?.some((item) => item.role.name === ADMIN_ROLE)) return false;

  const role = await prisma.role.upsert({
    where: { name: ADMIN_ROLE },
    update: {},
    create: { name: ADMIN_ROLE, description: "Full administrative role" }
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id }
  });
  return true;
}
