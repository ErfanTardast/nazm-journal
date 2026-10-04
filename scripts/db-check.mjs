/**
 * Database preflight: npm run db:check (the db:* scripts run it first).
 *
 * It reads .env, connects to DATABASE_URL and checks that the database has tables. It needs no build and no
 * dependency beyond `pg` and `dotenv`.
 *
 *   npm run db:check
 *   npm run db:check -- --require-migrations   also fail (exit 1) when the database has no tables yet
 *
 * "Database preflight passed" is printed only for a database that has its tables (or whose table list cannot be read).
 * A reachable database with no tables prints "PostgreSQL is reachable." and one line saying what to run, and still
 * exits 0 unless --require-migrations is given: `prisma migrate dev` (npm run db:migrate) must be able to start on an
 * empty database.
 */
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** What to run on a database that answers but has no tables: apply the migrations, then seed. */
export const UNMIGRATED_LINE = "This database has no tables yet. Run `npx prisma migrate deploy`, then `npm run db:seed`.";

/** The setup help printed under a failed preflight. The same on every operating system. */
export function failureHelp(message) {
  return [
    "",
    "Nazm database preflight failed",
    "------------------------------",
    message,
    "",
    "What to check:",
    "1. Confirm .env exists in the project folder (copy .env.example to .env).",
    "2. Confirm DATABASE_URL points to your PostgreSQL database.",
    "3. Start PostgreSQL, or start the Docker DB service:",
    "   docker compose up -d db",
    "4. If using local PostgreSQL, create the database if needed:",
    "   createdb nazm",
    "5. Then create the tables and seed the data:",
    "   npx prisma migrate deploy",
    "   npm run db:seed",
    ""
  ].join("\n");
}

/**
 * Whether the database holds Nazm's tables: Prisma's migration table (`prisma migrate`), or the User table of a
 * database built with `prisma db push`, which has no migration table.
 */
export function isMigrated(tableNames) {
  return tableNames.includes("_prisma_migrations") || tableNames.includes("User");
}

async function defaultCreateClient(connectionString) {
  const { default: pg } = await import("pg");
  return new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
}

/** Runs the preflight and returns the exit code. Everything it touches is passed in, so a test needs no database. */
export async function main({
  argv = [],
  env = process.env,
  out = console.log,
  err = console.error,
  createClient = defaultCreateClient
} = {}) {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    err(failureHelp("DATABASE_URL is missing. Copy .env.example to .env and set DATABASE_URL."));
    return 1;
  }

  const client = await createClient(databaseUrl);
  try {
    await client.connect();
    await client.query("select 1");
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? ` (${error.code})` : "";
    err(failureHelp(`PostgreSQL is not running or not reachable${code}. Check .env, DATABASE_URL, and the database service.`));
    await client.end().catch(() => undefined);
    return 1;
  }

  try {
    let tableNames = null;
    try {
      const { rows } = await client.query(
        "select distinct table_name from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema')"
      );
      tableNames = rows.map((row) => String(row.table_name));
    } catch {
      // A connection that works must not fail because the table list could not be read (permissions, odd setups).
    }
    if (tableNames && !isMigrated(tableNames)) {
      // Connected, but not ready: "passed" would be wrong for a run that can still exit 1.
      out("PostgreSQL is reachable.");
      err(UNMIGRATED_LINE);
      return argv.includes("--require-migrations") ? 1 : 0;
    }
    out("Database preflight passed: PostgreSQL is reachable.");
    return 0;
  } finally {
    await client.end().catch(() => undefined);
  }
}

// Run from the command line (not when a test imports the functions above).
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  await import("dotenv/config");
  process.exitCode = await main({ argv: process.argv.slice(2) });
}
