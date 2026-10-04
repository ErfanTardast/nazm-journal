import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

// scripts/db-check.mjs is plain JavaScript that a person runs (npm run db:check). The tests import it through a computed
// path, so the project's typecheck does not need declarations for a script, and describe its shape here.
type Client = { connect(): Promise<void>; query(sql: string): Promise<{ rows: Array<Record<string, unknown>> }>; end(): Promise<void> };
type DbCheck = {
  failureHelp(message: string): string;
  isMigrated(tableNames: string[]): boolean;
  UNMIGRATED_LINE: string;
  main(options: {
    argv?: string[];
    env?: Record<string, string | undefined>;
    out?: (line: string) => void;
    err?: (line: string) => void;
    createClient?: (connectionString: string) => Client;
  }): Promise<number>;
};

const load = async () => (await import(/* @vite-ignore */ pathToFileURL(join(process.cwd(), "scripts/db-check.mjs")).href)) as DbCheck;

const MIGRATE = "npx prisma migrate deploy";
const SEED = "npm run db:seed";

/** A stand-in for a pg client: `tables` is what the database has; `connectError` makes the connection fail. */
function fakeClient(options: { tables?: string[]; connectError?: Error; tablesError?: Error }) {
  const calls = { ended: 0, queries: [] as string[] };
  const client: Client = {
    async connect() {
      if (options.connectError) throw options.connectError;
    },
    async query(sql: string) {
      calls.queries.push(sql);
      if (/information_schema/i.test(sql)) {
        if (options.tablesError) throw options.tablesError;
        return { rows: (options.tables ?? []).map((table_name) => ({ table_name })) };
      }
      return { rows: [{ "?column?": 1 }] };
    },
    async end() {
      calls.ended += 1;
    }
  };
  return { client, calls };
}

async function run(options: Parameters<typeof fakeClient>[0], argv: string[] = [], env: Record<string, string | undefined> = { DATABASE_URL: "postgresql://u:p@localhost:5432/db" }) {
  const { main } = await load();
  const { client, calls } = fakeClient(options);
  const out: string[] = [];
  const err: string[] = [];
  const code = await main({ argv, env, out: (l) => out.push(l), err: (l) => err.push(l), createClient: () => client });
  return { code, out: out.join("\n"), err: err.join("\n"), calls };
}

describe("db-check advice", () => {
  it("is the same on every operating system: no Windows or PowerShell heading", async () => {
    const { failureHelp } = await load();
    const help = failureHelp("PostgreSQL is not reachable.");
    expect(help).not.toMatch(/windows|powershell/i);
    expect(help).toContain("What to check:");
    expect(help).toContain("PostgreSQL is not reachable.");
  });

  it("ends with migrate deploy then the seed, never with prisma migrate dev", async () => {
    const { failureHelp } = await load();
    const help = failureHelp("x");
    expect(help).toContain(MIGRATE);
    expect(help).toContain(SEED);
    expect(help.indexOf(MIGRATE)).toBeLessThan(help.indexOf(SEED));
    expect(help).not.toContain("npm run db:migrate");
  });

  it("tells a database with no tables what to run, in one line", async () => {
    const { UNMIGRATED_LINE } = await load();
    expect(UNMIGRATED_LINE).toContain(MIGRATE);
    expect(UNMIGRATED_LINE).toContain(SEED);
    expect(UNMIGRATED_LINE).not.toContain("\n");
  });
});

describe("isMigrated", () => {
  it("is true when Prisma's migration table is there", async () => {
    const { isMigrated } = await load();
    expect(isMigrated(["_prisma_migrations", "User"])).toBe(true);
    expect(isMigrated(["_prisma_migrations"])).toBe(true);
  });

  it("is true for a database built with prisma db push, which has the tables but no migration table", async () => {
    const { isMigrated } = await load();
    expect(isMigrated(["User", "Trade", "Permission"])).toBe(true);
  });

  it("is false for an empty database and for one with only unrelated tables", async () => {
    const { isMigrated } = await load();
    expect(isMigrated([])).toBe(false);
    expect(isMigrated(["some_other_app_table"])).toBe(false);
  });
});

describe("db-check run", () => {
  it("fails with the setup help when DATABASE_URL is missing", async () => {
    const result = await run({}, [], {});
    expect(result.code).toBe(1);
    expect(result.err).toContain("DATABASE_URL is missing");
    expect(result.err).toContain(".env.example");
    expect(result.calls.queries).toEqual([]);
  });

  it("fails with the setup help when PostgreSQL cannot be reached, and closes the client", async () => {
    const result = await run({ connectError: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }) });
    expect(result.code).toBe(1);
    expect(result.err).toContain("not running or not reachable (ECONNREFUSED)");
    expect(result.err).toContain("docker compose up -d db");
    expect(result.err).not.toMatch(/windows|powershell/i);
    expect(result.calls.ended).toBe(1);
  });

  it("passes quietly on a migrated database", async () => {
    const result = await run({ tables: ["_prisma_migrations", "User", "Permission"] });
    expect(result.code).toBe(0);
    expect(result.out).toContain("Database preflight passed");
    expect(result.err).toBe("");
    expect(result.calls.ended).toBe(1);
  });

  it("passes a database made with prisma db push without a warning", async () => {
    const result = await run({ tables: ["User", "Trade"] });
    expect(result.code).toBe(0);
    expect(result.err).toBe("");
  });

  it("on an empty database still connects, but says to migrate then seed before the seed fails on a missing table", async () => {
    const result = await run({ tables: [] });
    expect(result.code).toBe(0);
    expect(result.out).toContain("PostgreSQL is reachable.");
    // "passed" is for a database that is ready: this one still needs its tables.
    expect(result.out).not.toContain("passed");
    expect(result.err.trim().split("\n")).toHaveLength(1);
    expect(result.err).toContain(MIGRATE);
    expect(result.err).toContain(SEED);
  });

  it("fails an empty database when asked to require migrations (for the commands that read tables)", async () => {
    const result = await run({ tables: [] }, ["--require-migrations"]);
    expect(result.code).toBe(1);
    expect(result.err).toContain(MIGRATE);
    // A run that exits 1 must not print "passed" on the way.
    expect(result.out).not.toContain("passed");
    expect(result.out).toContain("PostgreSQL is reachable.");
    expect(result.calls.ended).toBe(1);
  });

  it("says passed once, for a database that has its tables, and for one whose table list cannot be read", async () => {
    const migrated = await run({ tables: ["_prisma_migrations"] }, ["--require-migrations"]);
    expect(migrated.out).toBe("Database preflight passed: PostgreSQL is reachable.");
    const unreadable = await run({ tablesError: new Error("permission denied") }, ["--require-migrations"]);
    expect(unreadable.out).toBe("Database preflight passed: PostgreSQL is reachable.");
  });

  it("does not fail a working connection because the table list could not be read", async () => {
    const result = await run({ tablesError: new Error("permission denied for schema information_schema") }, ["--require-migrations"]);
    expect(result.code).toBe(0);
    expect(result.err).toBe("");
  });
});

describe("db-check as a command", () => {
  // The script only runs main() when it is the file node was started with. If that guard broke, `npm run db:check` would
  // print nothing and exit 0, and every db:* script would skip its preflight without a word. So start it as a person does.
  it("really runs when started from the command line: no DATABASE_URL means exit 1 with the setup help", () => {
    const env = { ...process.env };
    for (const name of ["DATABASE_URL", "RESET_EMAIL", "RESET_PASSWORD"]) delete env[name];
    // From a folder with no .env, so nothing is loaded into the environment.
    const result = spawnSync(process.execPath, [join(process.cwd(), "scripts/db-check.mjs")], { cwd: tmpdir(), env, encoding: "utf8", timeout: 30_000 });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("DATABASE_URL is missing");
  }, 40_000);
});
