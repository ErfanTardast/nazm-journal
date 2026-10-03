import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// `npm install` on Windows once dropped two optional Linux-side packages from package-lock.json. `npm ci` still passed
// on Windows, and failed on Linux (CI and the Docker build) with "Missing: … from lock file". This reads the lockfile
// the way npm resolves a dependency: from the package's own folder upwards.
type LockPackage = {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  bundleDependencies?: string[];
  inBundle?: boolean;
};

const lock = JSON.parse(readFileSync(join(process.cwd(), "package-lock.json"), "utf8")) as { packages: Record<string, LockPackage> };

function resolves(from: string, name: string) {
  let folder = from;
  for (;;) {
    if (lock.packages[`${folder ? `${folder}/` : ""}node_modules/${name}`]) return true;
    if (!folder) return false;
    const cut = folder.lastIndexOf("/node_modules/");
    folder = cut === -1 ? "" : folder.slice(0, cut);
  }
}

describe("package-lock.json", () => {
  it("has an entry for every dependency of every package it lists", () => {
    const missing: string[] = [];
    for (const [path, entry] of Object.entries(lock.packages)) {
      // A package that ships its dependencies inside its own tarball does not list them in the lockfile.
      if (entry.inBundle) continue;
      const bundled = new Set(entry.bundleDependencies ?? []);
      for (const name of Object.keys({ ...entry.dependencies, ...entry.optionalDependencies })) {
        if (bundled.has(name)) continue;
        if (!resolves(path, name)) missing.push(`${path || "(root)"} -> ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
