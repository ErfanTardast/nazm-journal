// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function modelBlock(schema: string, name: string) {
  const match = new RegExp(`^model ${name} \\{([\\s\\S]*?)^\\}`, "m").exec(schema);
  return match?.[1] ?? "";
}

describe("core loop data model", () => {
  const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");

  it("keeps the first-run answers and the sample workspace mark on the user, all optional", () => {
    const user = modelBlock(schema, "User");
    expect(user).toMatch(/\btradingPlatform\s+String\?/);
    expect(user).toMatch(/\bprimaryGoal\s+String\?/);
    expect(user).toMatch(/\bonboardedAt\s+DateTime\?/);
    expect(user).toMatch(/\bsampleLoadedAt\s+DateTime\?/);
  });

  it("gives a strategy optional numeric risk limits", () => {
    const strategy = modelBlock(schema, "Strategy");
    expect(strategy).toMatch(/\briskPerTradePct\s+Decimal\?\s+@db\.Decimal\(8, 4\)/);
    expect(strategy).toMatch(/\bmaxDailyLossPct\s+Decimal\?\s+@db\.Decimal\(8, 4\)/);
    expect(strategy).toMatch(/\bmaxOpenPositions\s+Int\?/);
  });

  it("lets a plan keep the sizing the risk desk worked out", () => {
    expect(modelBlock(schema, "TradePlan")).toMatch(/\bsizing\s+Json\?/);
  });

  it.each(["Trade", "Strategy", "TradePlan", "Review"])("marks sample rows on %s, off by default", (name) => {
    expect(modelBlock(schema, name)).toMatch(/\bisSample\s+Boolean\s+@default\(false\)/);
  });
});

describe("core loop migration", () => {
  // Found by its name, not by its position: later migrations may be added after it.
  const folders = readdirSync(join(root, "prisma/migrations")).filter((name) => /^\d{14}_core_loop$/.test(name));
  const sql = folders[0] ? readFileSync(join(root, "prisma/migrations", folders[0], "migration.sql"), "utf8") : "";

  it("exists exactly once", () => {
    expect(folders).toHaveLength(1);
  });

  it("only adds columns: nothing is dropped, renamed or rewritten", () => {
    expect(sql).not.toMatch(/\bDROP\b|\bRENAME\b|\bUPDATE\b|\bDELETE\b|ALTER COLUMN/i);
  });

  it("adds the sample mark with a default, so existing rows are never sample rows", () => {
    for (const table of ["Trade", "Strategy", "TradePlan", "Review"]) {
      const alter = new RegExp(`ALTER TABLE "${table}"[^;]*"isSample" BOOLEAN NOT NULL DEFAULT false`).exec(sql);
      expect(alter, table).not.toBeNull();
    }
  });

  it("adds every other new column as nullable", () => {
    expect(sql).toMatch(/ALTER TABLE "User"[^;]*"tradingPlatform" TEXT[,;]/);
    expect(sql).toMatch(/ALTER TABLE "User"[^;]*"primaryGoal" TEXT[,;]/);
    expect(sql).toMatch(/ALTER TABLE "User"[^;]*"onboardedAt" TIMESTAMP\(3\)[,;]/);
    expect(sql).toMatch(/ALTER TABLE "User"[^;]*"sampleLoadedAt" TIMESTAMP\(3\)[,;]/);
    expect(sql).toMatch(/ALTER TABLE "Strategy"[^;]*"riskPerTradePct" DECIMAL\(8,4\)[,;]/);
    expect(sql).toMatch(/ALTER TABLE "Strategy"[^;]*"maxDailyLossPct" DECIMAL\(8,4\)[,;]/);
    expect(sql).toMatch(/ALTER TABLE "Strategy"[^;]*"maxOpenPositions" INTEGER[,;]/);
    expect(sql).toMatch(/ALTER TABLE "TradePlan"[^;]*"sizing" JSONB[,;]/);
  });
});
