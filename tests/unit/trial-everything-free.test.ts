import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? routeFiles(full) : name === "route.ts" ? [full] : [];
  });
}

describe("trial: every implemented feature is free while payments are off", () => {
  it("has no plan gate in an API route that is not lifted when payments are off", () => {
    const gated = routeFiles("src/app/api").filter((file) => /\b(hasFeature|checkLimit)\(/.test(readFileSync(file, "utf8")));
    const unguarded = gated.filter((file) => !readFileSync(file, "utf8").includes("paymentsEnabled()"));

    expect(unguarded).toEqual([]);
  });
});
