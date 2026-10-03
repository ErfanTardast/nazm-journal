/**
 * The seeded demo login. It was demo@trademaster.ai before the product was renamed, and a local database seeded back
 * then still holds that account with its trades, journal and reviews. Both launchers run `npm run db:seed` on every
 * start, so the seed renames that account in place before it upserts the demo user: the upsert then finds it, and the
 * login the sign-in page shows opens the workspace that has the data, instead of a second, empty one.
 */
export const DEMO_EMAIL = "demo@nazm.example";
export const FORMER_DEMO_EMAIL = "demo@trademaster.ai";

/** The part of the Prisma client this needs, so a test can stand in for the database. */
type UserTable = {
  findUnique(args: { where: { email: string }; select: { id: true } }): Promise<{ id: string } | null>;
  updateMany(args: { where: { email: string }; data: { email: string } }): Promise<{ count: number }>;
};

/**
 * Renames the former demo account to the current demo login. Returns whether it renamed one. It does nothing when the
 * current login already exists (the former account is then left as it is, never merged) or when there is no former one.
 */
export async function renameFormerDemoAccount(db: { user: UserTable }): Promise<boolean> {
  const current = await db.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true } });
  if (current) return false;
  const renamed = await db.user.updateMany({ where: { email: FORMER_DEMO_EMAIL }, data: { email: DEMO_EMAIL } });
  return renamed.count > 0;
}
