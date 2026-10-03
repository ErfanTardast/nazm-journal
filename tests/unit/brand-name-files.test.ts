// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The product is called Nazm in English and «نظم» in Persian. "TradeMaster" was a name another project already uses,
// so it must not come back into a page, a message, a manifest, a cookie or a document. This file reads the tracked
// text; tests/unit/brand-name.test.ts renders the pages and checks the name each language shows.
//
// It runs without a browser environment and reads every scanned file once: the scan reads about 370 files, which took
// 0.4 to 0.5 s per test when every test read them again, and timed out when the whole suite ran.

/**
 * Identifiers that keep the old spelling on purpose. Each one is data or the name of something that really exists,
 * and each one is allowed only in the files that need it, so the same text in a page or a message still fails.
 */
const KEPT: Array<{ why: string; pattern: RegExp; files: string[] }> = [
  {
    why: "local database name",
    pattern: /trademaster_ai/g,
    files: [".env.example", "docker-compose.yml", "README.md", "scripts/db-check.mjs", "src/lib/env.ts", "start-app.cmd", "start-app-prod.cmd"]
  },
  { why: "local database user and password in a connection string", pattern: /trademaster:trademaster/g, files: [".env.example", "docker-compose.yml", "src/lib/env.ts"] },
  { why: "stored import source value", pattern: /trademaster_csv/g, files: ["src/lib/services/trades.ts"] },
  { why: "the hosting provider's app name", pattern: /`trademaster-ai`/g, files: ["docs/DEPLOYMENT.md"] },
  { why: "the hosting provider's address", pattern: /trademaster-ai\.example-host\.net/g, files: ["scripts/verify-deploy.ts"] },
  { why: "the local compose database's user and password", pattern: /POSTGRES_(USER|PASSWORD): trademaster\b/g, files: ["docker-compose.yml"] },
  {
    why: "the database user the launchers' health check asks",
    pattern: /-U trademaster /g,
    files: ["docker-compose.yml", "start-app.cmd", "start-app-prod.cmd"]
  },
  { why: "former demo login, renamed in place by the seed", pattern: /demo@trademaster\.ai/g, files: ["src/lib/services/demo-account.ts"] }
];

// History and the specs it points to keep the name the work was done under.
const HISTORY = ["docs/DEVELOPMENT_PLAN.md", "docs/superpowers/"];

const TEXT_FILE = /\.(ts|tsx|js|mjs|json|md|css|svg|webmanifest|html|txt|yml|yaml|cmd|toml)$/;

const root = process.cwd();

function walk(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const rootFiles = readdirSync(root).filter((name) => /\.cmd$/.test(name));
const scanned = [
  ...walk("src"),
  ...walk("public"),
  ...walk("docs"),
  ...walk("scripts"),
  "prisma/seed.ts",
  "README.md",
  "package.json",
  ".env.example",
  "docker-compose.yml",
  ...rootFiles
]
  .filter((file) => TEXT_FILE.test(file) || file === ".env.example" || file === "docker-compose.yml")
  .filter((file) => !HISTORY.some((prefix) => file === prefix || file.startsWith(prefix)));

/** Every scanned file, read once. */
const contents = new Map(scanned.map((file) => [file, readFileSync(join(root, file), "utf8")] as const));

/** The lines of `text` (from `file`) that still carry the old name once the identifiers kept for that file are taken out. */
function oldNameLines(text: string, file = ""): string[] {
  const kept = KEPT.filter((entry) => entry.files.includes(file));
  return text
    .split(/\r?\n/)
    .map((line) => kept.reduce((rest, { pattern }) => rest.replace(pattern, " "), line))
    .filter((line) => /trade[ _-]?master/i.test(line));
}

/**
 * A drive letter followed by a path: `C:\Users`, `D:\Projects`, the same escaped inside source (`C:\\Users`),
 * `D:/work` and a lower-case `d:\x`. It does not match a URL scheme (`https://`, `redis://`) or `user:password@`.
 */
const PERSONAL_FOLDER = /(^|[^A-Za-z0-9_])[A-Za-z]:(\\{1,2}|\/)(?=[A-Za-z0-9._~ -])/;

const SCAN_TIMEOUT = 30_000;

describe("the old product name is gone", () => {
  it("recognises the old name and the kept identifiers (the check below can fail)", () => {
    expect(oldNameLines("<h1>TradeMaster AI</h1>")).toHaveLength(1);
    expect(oldNameLines("demo@trademaster.ai")).toHaveLength(1);
    expect(oldNameLines("the TradeMaster AI app")).toHaveLength(1);
    expect(oldNameLines("DATABASE_URL=postgresql://trademaster:trademaster@localhost:5432/trademaster_ai", ".env.example")).toHaveLength(0);
    expect(oldNameLines('sourceType: "trademaster_csv"', "src/lib/services/trades.ts")).toHaveLength(0);
    expect(oldNameLines('const FORMER = "demo@trademaster.ai";', "src/lib/services/demo-account.ts")).toHaveLength(0);
  });

  it("lets a kept identifier through only in the files that need it", () => {
    // The same words in a page, a message or another document are the old name.
    const page = "src/features/landing/landing-copy.ts";
    expect(oldNameLines("trademaster-db is in private beta", page)).toHaveLength(1);
    expect(oldNameLines("Open trademaster-ai.example-host.net to sign in", page)).toHaveLength(1);
    expect(oldNameLines("app `trademaster-ai`", page)).toHaveLength(1);
    expect(oldNameLines("pg_isready -U trademaster -d db", page)).toHaveLength(1);
    expect(oldNameLines("Use trademaster_ai as the database", "docs/SECURITY.md")).toHaveLength(1);
    expect(oldNameLines("demo@trademaster.ai", "prisma/seed.ts")).toHaveLength(1);
    // The files that really hold them are still let through.
    expect(oldNameLines("pg_isready -U trademaster -d trademaster_ai", "docker-compose.yml")).toHaveLength(0);
    expect(oldNameLines("APP: https://trademaster-ai.example-host.net", "scripts/verify-deploy.ts")).toHaveLength(0);
  });

  it("is absent from every page, message, script, manifest and document except the kept identifiers and the history", () => {
    const found: string[] = [];
    for (const [file, text] of contents) {
      oldNameLines(text, file).forEach((line) => found.push(`${file}: ${line.trim().slice(0, 120)}`));
    }
    expect(found).toEqual([]);
  }, SCAN_TIMEOUT);

  it("recognises a personal folder in each way it can be written (the check below can fail)", () => {
    for (const path of [
      "cd D:\\Projects\\journal",
      'cd "D:/work/app"',
      'console.error("1. Confirm .env exists in C:\\\\Users\\\\someone\\\\app.")',
      "d:\\x",
      "see C:/Users/someone/app"
    ]) {
      expect(PERSONAL_FOLDER.test(path), path).toBe(true);
    }
    for (const text of ["https://example.org/a", "redis://localhost:6379", "postgresql://u:p@localhost:5432/db", "key:value", "Step 2: Open the page", "a:b"]) {
      expect(PERSONAL_FOLDER.test(text), text).toBe(false);
    }
  });

  it("names no personal folder in tracked text", () => {
    const found: string[] = [];
    for (const [file, text] of contents) {
      text
        .split(/\r?\n/)
        .filter((line) => PERSONAL_FOLDER.test(line))
        .forEach((line) => found.push(`${file}: ${line.trim().slice(0, 120)}`));
    }
    expect(found).toEqual([]);
  }, SCAN_TIMEOUT);

  it("never writes «برنامه نظم»: the product avoids «برنامه» for both a plan and an app", () => {
    const found = [...contents].filter(([, text]) => text.includes("برنامه نظم")).map(([file]) => file);
    expect(found).toEqual([]);
  }, SCAN_TIMEOUT);

  // The release notes' one-liners are store metadata. The Persian one follows the glossary (پلن, never «برنامه», for a
  // plan) and does not put «نظم» where it could be read as the product's name.
  it("keeps the store one-liners in the glossary's words", () => {
    const release = contents.get("docs/RELEASE.md") ?? "";
    const line = release.split(/\r?\n/).find((text) => text.startsWith("- **One-liner (FA):**")) ?? "";
    expect(line).toBe("- **One-liner (FA):** پلن، ژورنال، مرور و بهبود انضباط معاملاتی.");
    expect(line).not.toContain("برنامه");
    expect(line).not.toContain("نظم");
  });

  it("renames the package and the lockfile's own name entries", () => {
    expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name).toBe("nazm");
    const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")) as { name: string; packages: Record<string, { name?: string }> };
    expect(lock.name).toBe("nazm");
    expect(lock.packages[""].name).toBe("nazm");
  });
});
