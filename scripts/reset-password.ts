/**
 * Reset an account's password from the server. A self-hosted Nazm cannot send e-mail, so a forgotten password cannot be
 * reset from the sign-in page: whoever runs the server does it here.
 *
 * The e-mail and the new password come from the environment, not from command-line arguments (an argument shows in the
 * process list and in the shell history), and neither is ever printed. The examples below read the password at a
 * prompt that does not echo it, so it is never typed on a command line either. The new password follows the sign-up
 * rules: 12 to 128 characters with an uppercase letter, a lowercase letter and a number.
 *
 *   bash:         read -rsp 'New password: ' RESET_PASSWORD && export RESET_PASSWORD
 *                 RESET_EMAIL=sara@example.com npm run user:reset-password; unset RESET_PASSWORD
 *   zsh:          read -rs 'RESET_PASSWORD?New password: ' && export RESET_PASSWORD
 *                 RESET_EMAIL=sara@example.com npm run user:reset-password; unset RESET_PASSWORD
 *   PowerShell 7: $env:RESET_EMAIL = "sara@example.com"; $env:RESET_PASSWORD = Read-Host -MaskInput "New password"
 *                 npm run user:reset-password; Remove-Item Env:RESET_PASSWORD
 *   Docker:       read the password in the host shell as in the bash or zsh lines above, then name the variable
 *                 without a value, so docker takes it from the host environment and not from the command line:
 *                 docker compose exec -e RESET_EMAIL=sara@example.com -e RESET_PASSWORD app npm run user:reset-password
 *                 unset RESET_PASSWORD
 *
 * It stores the new bcrypt hash, signs the account out everywhere and uses up its open reset links, in one transaction,
 * and writes one audit-log entry. On success it prints "password changed for <e-mail>, other sessions signed out";
 * otherwise one line saying what is wrong (no such account, weak password, a missing variable).
 */
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/lib/security/password";
import { passwordChangeSchema, registerSchema } from "@/lib/validation/auth";

/** The part of the database client the reset uses. */
export type ResetDb = Pick<PrismaClient, "user" | "session" | "passwordResetToken" | "auditLog" | "$transaction">;

export type ResetResult =
  | { ok: true; email: string }
  | { ok: false; code: "INVALID_EMAIL" | "WEAK_PASSWORD" }
  | { ok: false; code: "NO_ACCOUNT"; email: string };

/**
 * Sets the account's password and ends its sessions. The e-mail is read the way sign-in reads it (trimmed, lower case);
 * the password has to pass the sign-up rules. Throws when the database fails, having changed nothing.
 */
export async function resetPassword(db: ResetDb, input: { email: string; password: string }): Promise<ResetResult> {
  const email = registerSchema.shape.email.safeParse(input.email.trim());
  if (!email.success) return { ok: false, code: "INVALID_EMAIL" };
  // The same rule the sign-up form and the change-password form use, so a password accepted here works everywhere.
  if (!passwordChangeSchema.shape.newPassword.safeParse(input.password).success) return { ok: false, code: "WEAK_PASSWORD" };

  const user = await db.user.findUnique({ where: { email: email.data }, select: { id: true, email: true } });
  if (!user) return { ok: false, code: "NO_ACCOUNT", email: email.data };

  const passwordHash = await hashPassword(input.password);
  // One transaction, like the change-password route: a new hash with the old sessions still alive, or sessions gone with
  // the old hash, would be worse than either all or nothing. A reset link mailed before this must not undo it.
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash } }),
    db.session.deleteMany({ where: { userId: user.id } }),
    db.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    db.auditLog.create({ data: { userId: user.id, action: "auth.password_reset.operator", entity: "User", entityId: user.id } })
  ]);
  return { ok: true, email: user.email };
}

const MISSING =
  "Set RESET_EMAIL and RESET_PASSWORD in the environment (see the usage comment at the top of scripts/reset-password.ts).";
const WEAK = "The password is too weak: use 12 to 128 characters with an uppercase letter, a lowercase letter and a number.";

/** Runs the reset for what the environment holds and returns the exit code. Prints only the lines described above. */
export async function main({
  env,
  db,
  out = console.log,
  err = console.error
}: {
  env: Record<string, string | undefined>;
  db: ResetDb;
  out?: (line: string) => void;
  err?: (line: string) => void;
}): Promise<number> {
  const email = env.RESET_EMAIL?.trim();
  const password = env.RESET_PASSWORD;
  if (!email || !password) {
    err(MISSING);
    return 1;
  }

  try {
    const result = await resetPassword(db, { email, password });
    if (result.ok) {
      out(`password changed for ${result.email}, other sessions signed out`);
      return 0;
    }
    if (result.code === "NO_ACCOUNT") err(`No account has the e-mail ${result.email}.`);
    else if (result.code === "WEAK_PASSWORD") err(WEAK);
    else err("RESET_EMAIL is not a valid e-mail address.");
    return 1;
  } catch (error) {
    // A fixed line: the raw error can carry the connection string or the query.
    const code = typeof error === "object" && error && "code" in error ? ` (${String(error.code)})` : "";
    err(`Password was not changed: the database call failed${code}. Nothing was written.`);
    return 1;
  }
}

// Run from the command line (not when a test imports the functions above).
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  await import("dotenv/config");
  const { prisma } = await import("@/lib/db/prisma");
  try {
    process.exitCode = await main({ env: process.env, db: prisma });
  } finally {
    await prisma.$disconnect();
  }
}
