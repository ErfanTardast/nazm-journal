// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function modelBlock(schema: string, name: string) {
  const match = new RegExp(`^model ${name} \\{([\\s\\S]*?)^\\}`, "m").exec(schema);
  return match?.[1] ?? "";
}

describe("AccessRequest data model", () => {
  const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
  const model = modelBlock(schema, "AccessRequest");

  it("exists with the fields of a request for an invite", () => {
    expect(model).not.toBe("");
    expect(model).toMatch(/\bid\s+String\s+@id @default\(cuid\(\)\)/);
    expect(model).toMatch(/\bname\s+String\b/);
    expect(model).toMatch(/\bemail\s+String\s+@unique/);
    expect(model).toMatch(/\btradingPlatform\s+String\?/);
    expect(model).toMatch(/\bnote\s+String\?/);
    expect(model).toMatch(/\blocale\s+Locale\b/);
    expect(model).toMatch(/\bstatus\s+String\s+@default\("new"\)/);
    expect(model).toMatch(/\bcreatedAt\s+DateTime\s+@default\(now\(\)\)/);
    expect(model).toMatch(/\bupdatedAt\s+DateTime\s+@updatedAt/);
  });

  it("stores no IP address or user agent", () => {
    expect(model).not.toMatch(/ipAddress|userAgent/i);
    expect(model).not.toMatch(/agent/i);
  });
});

describe("AccessRequest migration", () => {
  // Found by its name, not by its position: later migrations may be added after it.
  const folders = readdirSync(join(root, "prisma/migrations")).filter((name) => /^\d{14}_add_access_requests$/.test(name));
  const sql = folders[0] ? readFileSync(join(root, "prisma/migrations", folders[0], "migration.sql"), "utf8") : "";

  it("exists exactly once and creates the table", () => {
    expect(folders).toHaveLength(1);
    expect(sql).toMatch(/CREATE TABLE "AccessRequest"/);
  });

  it("makes the e-mail unique and keeps no IP address or user agent", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX "AccessRequest_email_key" ON "AccessRequest"\("email"\)/);
    expect(sql).toMatch(/"status" TEXT NOT NULL DEFAULT 'new'/);
    expect(sql).not.toMatch(/ipAddress|userAgent/i);
  });
});
