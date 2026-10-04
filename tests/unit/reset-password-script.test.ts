import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyPassword } from "@/lib/security/password";
import { main, resetPassword } from "../../scripts/reset-password";

type ResetDb = Parameters<typeof resetPassword>[0];

const OLD = "OldPassword123!";
const NEW = "BrandNewPass456!";
const EMAIL = "sara@example.com";

type State = {
  users: { id: string; email: string; passwordHash: string; name: string }[];
  sessions: { id: string; userId: string }[];
  tokens: { id: string; userId: string; usedAt: Date | null }[];
  audit: { userId: string | null; action: string; entity: string; entityId: string | null }[];
};

/**
 * A small in-memory stand-in for the three tables the script touches. Like Prisma's, a write is a lazy query that only
 * runs inside `$transaction`, and a failure in any of them undoes the ones before it.
 */
function fakeDb(options: { failOn?: "session" | "transaction"; findError?: Error } = {}) {
  const state: State = {
    users: [
      { id: "u1", email: EMAIL, passwordHash: "", name: "Sara" },
      { id: "u2", email: "omid@example.com", passwordHash: "other-hash", name: "Omid" }
    ],
    sessions: [
      { id: "s1", userId: "u1" },
      { id: "s2", userId: "u1" },
      { id: "s3", userId: "u2" }
    ],
    tokens: [
      { id: "t1", userId: "u1", usedAt: null },
      { id: "t2", userId: "u1", usedAt: new Date("2026-01-01T00:00:00Z") },
      { id: "t3", userId: "u2", usedAt: null }
    ],
    audit: []
  };
  const transactions: number[] = [];
  const db = {
    user: {
      async findUnique(args: { where: { email: string } }) {
        if (options.findError) throw options.findError;
        const user = state.users.find((u) => u.email === args.where.email);
        return user ? { ...user } : null;
      },
      update: (args: { where: { id: string }; data: { passwordHash: string } }) => () => {
        const user = state.users.find((u) => u.id === args.where.id);
        if (user) user.passwordHash = args.data.passwordHash;
      }
    },
    session: {
      deleteMany: (args: { where: { userId: string } }) => () => {
        if (options.failOn === "session") throw new Error("session table is locked");
        state.sessions = state.sessions.filter((s) => s.userId !== args.where.userId);
      }
    },
    passwordResetToken: {
      updateMany: (args: { where: { userId: string; usedAt: null }; data: { usedAt: Date } }) => () => {
        for (const token of state.tokens) if (token.userId === args.where.userId && token.usedAt === null) token.usedAt = args.data.usedAt;
      }
    },
    auditLog: {
      create: (args: { data: State["audit"][number] }) => () => {
        state.audit.push({ userId: args.data.userId, action: args.data.action, entity: args.data.entity, entityId: args.data.entityId });
      }
    },
    async $transaction(queries: Array<() => void>) {
      transactions.push(queries.length);
      const before = structuredClone(state);
      try {
        if (options.failOn === "transaction") throw new Error("postgresql://operator:s3cret@db/nazm: connection lost");
        for (const query of queries) query();
      } catch (error) {
        Object.assign(state, before);
        throw error;
      }
    }
  };
  return { db: db as unknown as ResetDb, state, transactions };
}

async function seeded(options?: Parameters<typeof fakeDb>[0]) {
  const fake = fakeDb(options);
  const { hashPassword } = await import("@/lib/security/password");
  fake.state.users[0]!.passwordHash = await hashPassword(OLD);
  return fake;
}

const lines = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, write: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) } };
};

describe("resetPassword", () => {
  it("stores the new password as the app does: a bcrypt hash that signs in with the new one only", async () => {
    const { db, state } = await seeded();
    const result = await resetPassword(db, { email: EMAIL, password: NEW });
    expect(result).toEqual({ ok: true, email: EMAIL });
    const stored = state.users[0]!.passwordHash;
    expect(stored).toMatch(/^\$2[aby]\$12\$/);
    expect(stored).not.toContain(NEW);
    expect(await verifyPassword(NEW, stored)).toBe(true);
    expect(await verifyPassword(OLD, stored)).toBe(false);
    expect(state.users[0]!.name).toBe("Sara");
  });

  it("signs the account out everywhere and uses up its open reset links, in one transaction", async () => {
    const { db, state, transactions } = await seeded();
    await resetPassword(db, { email: EMAIL, password: NEW });
    expect(state.sessions).toEqual([{ id: "s3", userId: "u2" }]);
    expect(state.tokens.find((t) => t.id === "t1")?.usedAt).toBeInstanceOf(Date);
    // A link that was already used keeps the time it was used; another account's link is not touched.
    expect(state.tokens.find((t) => t.id === "t2")?.usedAt).toEqual(new Date("2026-01-01T00:00:00Z"));
    expect(state.tokens.find((t) => t.id === "t3")?.usedAt).toBeNull();
    expect(state.users[1]!.passwordHash).toBe("other-hash");
    expect(transactions).toHaveLength(1);
  });

  it("leaves a trace for the account's owner in the audit log", async () => {
    const { db, state } = await seeded();
    await resetPassword(db, { email: EMAIL, password: NEW });
    expect(state.audit).toEqual([{ userId: "u1", action: "auth.password_reset.operator", entity: "User", entityId: "u1" }]);
  });

  it("changes nothing when any part of the transaction fails", async () => {
    const { db, state } = await seeded({ failOn: "session" });
    const before = structuredClone(state);
    await expect(resetPassword(db, { email: EMAIL, password: NEW })).rejects.toThrow("session table is locked");
    expect(state).toEqual(before);
    expect(await verifyPassword(OLD, state.users[0]!.passwordHash)).toBe(true);
  });

  it("finds the account whatever the case or spacing of the typed address", async () => {
    const { db } = await seeded();
    expect(await resetPassword(db, { email: "  Sara@Example.COM ", password: NEW })).toEqual({ ok: true, email: EMAIL });
  });

  it("says there is no such account, and writes nothing", async () => {
    const { db, state, transactions } = await seeded();
    const before = structuredClone(state);
    expect(await resetPassword(db, { email: "nobody@example.com", password: NEW })).toEqual({ ok: false, code: "NO_ACCOUNT", email: "nobody@example.com" });
    expect(state).toEqual(before);
    expect(transactions).toEqual([]);
  });

  it("says a text that is not an e-mail address is not one, and writes nothing", async () => {
    const { db, transactions } = await seeded();
    expect(await resetPassword(db, { email: "not-an-address", password: NEW })).toMatchObject({ ok: false, code: "INVALID_EMAIL" });
    expect(transactions).toEqual([]);
  });

  it.each([
    ["shorter than 12 characters", "Short1Aa"],
    ["without an uppercase letter", "alllowercase123"],
    ["without a lowercase letter", "ALLUPPERCASE123"],
    ["without a number", "NoNumbersHereAtAll"],
    ["longer than 128 characters", `Aa1${"x".repeat(130)}`]
  ])("refuses a password %s, the way sign-up does", async (_why, password) => {
    const { db, state, transactions } = await seeded();
    const before = structuredClone(state);
    expect(await resetPassword(db, { email: EMAIL, password })).toEqual({ ok: false, code: "WEAK_PASSWORD" });
    expect(state).toEqual(before);
    expect(transactions).toEqual([]);
  });
});

describe("the reset-password command", () => {
  it("prints one line when it works, and neither the password nor the hash", async () => {
    const { db, state } = await seeded();
    const { out, err, write } = lines();
    const code = await main({ env: { RESET_EMAIL: EMAIL, RESET_PASSWORD: NEW }, db, ...write });
    expect(code).toBe(0);
    expect(out).toEqual(["password changed for sara@example.com, other sessions signed out"]);
    expect(err).toEqual([]);
    expect(JSON.stringify([out, err])).not.toContain(NEW);
    expect(JSON.stringify([out, err])).not.toContain(state.users[0]!.passwordHash);
  });

  it("asks for RESET_EMAIL and RESET_PASSWORD when either is missing, and touches nothing", async () => {
    for (const env of [{}, { RESET_EMAIL: EMAIL }, { RESET_PASSWORD: NEW }, { RESET_EMAIL: "  ", RESET_PASSWORD: NEW }]) {
      const { db, transactions } = await seeded();
      const { out, err, write } = lines();
      expect(await main({ env, db, ...write })).toBe(1);
      expect(out).toEqual([]);
      expect(err.join("\n")).toContain("RESET_EMAIL");
      expect(err.join("\n")).toContain("RESET_PASSWORD");
      expect(JSON.stringify(err)).not.toContain(NEW);
      expect(transactions).toEqual([]);
    }
  });

  it("names the problem for an unknown account and for a weak password, without echoing the password", async () => {
    const { db } = await seeded();
    const unknown = lines();
    expect(await main({ env: { RESET_EMAIL: "nobody@example.com", RESET_PASSWORD: NEW }, db, ...unknown.write })).toBe(1);
    expect(unknown.err).toEqual(["No account has the e-mail nobody@example.com."]);

    const weak = lines();
    expect(await main({ env: { RESET_EMAIL: EMAIL, RESET_PASSWORD: "weakpass" }, db, ...weak.write })).toBe(1);
    expect(weak.err.join("\n")).toMatch(/too weak.*12.*uppercase.*lowercase.*number/);
    expect(JSON.stringify(weak)).not.toContain("weakpass");

    const invalid = lines();
    expect(await main({ env: { RESET_EMAIL: "nope", RESET_PASSWORD: NEW }, db, ...invalid.write })).toBe(1);
    expect(invalid.err.join("\n")).toContain("RESET_EMAIL is not a valid e-mail address");
  });

  it("reports a failed database call as one fixed line, never the raw error text", async () => {
    const { db, state } = await seeded({ failOn: "transaction" });
    const before = structuredClone(state);
    const { out, err, write } = lines();
    expect(await main({ env: { RESET_EMAIL: EMAIL, RESET_PASSWORD: NEW }, db, ...write })).toBe(1);
    expect(out).toEqual([]);
    expect(err).toHaveLength(1);
    expect(err[0]).toMatch(/^Password was not changed: the database call failed/);
    expect(JSON.stringify(err)).not.toMatch(/s3cret|postgresql:\/\//);
    expect(state).toEqual(before);
  });
});

describe("how an operator runs it", () => {
  it("is the npm script user:reset-password, after the database preflight", () => {
    const scripts = (JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts;
    expect(scripts["user:reset-password"]).toBe("npm run db:check && tsx scripts/reset-password.ts");
  });

  it("starts with a usage comment that says where the e-mail and password come from", () => {
    const source = readFileSync("scripts/reset-password.ts", "utf8");
    const header = source.slice(0, source.indexOf("*/"));
    expect(source.startsWith("/**")).toBe(true);
    expect(header).toContain("RESET_EMAIL");
    expect(header).toContain("RESET_PASSWORD");
    expect(header).toContain("npm run user:reset-password");
    expect(header).toMatch(/not .*(argument|argv|command line)/i);
  });

  it("never reads the e-mail or password from the command line", () => {
    expect(readFileSync("scripts/reset-password.ts", "utf8")).not.toContain("process.argv.slice");
  });

  it("shows no example that types the password on a command line: it would stay in the shell history and the process list", () => {
    const source = readFileSync("scripts/reset-password.ts", "utf8");
    const header = source.slice(0, source.indexOf("*/"));
    expect(header).not.toMatch(/RESET_PASSWORD\s*=\s*['"]/);
    // Where an example gives the variable a value at all, the value is what a hidden prompt returned.
    const assigned = Array.from(header.matchAll(/RESET_PASSWORD\s*=\s*(\S+)/g), (match) => match[1]);
    expect(assigned.every((value) => value === "Read-Host")).toBe(true);
    // Each shell's example reads the password at a prompt that does not echo it.
    expect(header).toContain("read -rs");
    expect(header).toContain("Read-Host -MaskInput");
    // The Docker example names the variable only, so docker takes its value from the shell instead of the command line.
    expect(header).toMatch(/docker compose exec -e RESET_EMAIL=\S+ -e RESET_PASSWORD app /);
  });
});

describe("the reset-password script as a command", () => {
  // The script only runs when it is the file tsx was started with. If that guard broke, `npm run user:reset-password`
  // would do nothing and still exit 0. So start it as an operator does, from a folder with no .env and no variables.
  it("really runs when started from the command line: without the variables it exits 1 and says what to set", () => {
    const root = process.cwd();
    const env = { ...process.env };
    for (const name of ["DATABASE_URL", "RESET_EMAIL", "RESET_PASSWORD"]) delete env[name];
    const result = spawnSync(
      process.execPath,
      [join(root, "node_modules/tsx/dist/cli.mjs"), "--tsconfig", join(root, "tsconfig.json"), join(root, "scripts/reset-password.ts")],
      { cwd: tmpdir(), env, encoding: "utf8", timeout: 60_000 }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Set RESET_EMAIL and RESET_PASSWORD");
  }, 70_000);
});

