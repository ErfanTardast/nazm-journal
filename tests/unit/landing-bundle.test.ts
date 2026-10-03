import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// gsap and three are only for the landing's charts. A static import, or an import from a shared layout, would put
// about 230 KB (compressed) into every page of the product.
const SRC = join(process.cwd(), "src");
const LANDING = join("features", "landing") + sep;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const mentionsLibrary = /["'](gsap(\/[\w-]+)?|three(\/[\w/.-]+)?)["']/;
// Loaded when used, or only a type: `import("gsap")`, `typeof import("gsap")`, `import type … from "three"`.
const lazyOrType = /import\(\s*["'](gsap|three)[^"']*["']\s*\)|import\s+type\s[^;]*from\s+["'](gsap|three)[^"']*["']/;
// The one module that names the three.js classes the ribbon uses; it is itself loaded with import().
const reExport = /^export\s*\{[^}]*\}\s*from\s*["']three["'];?$/;

describe("the landing's animation libraries", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const path = relative(SRC, file);
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .forEach((line, index) => {
        if (!mentionsLibrary.test(line)) return;
        const inLanding = path.startsWith(LANDING);
        const allowed = inLanding && (lazyOrType.test(line) || (path.endsWith("three-bits.ts") && reExport.test(line.trim())));
        if (!allowed) offenders.push(`${path}:${index + 1}: ${line.trim()}`);
      });
  }

  it("are imported only inside the landing feature, and only on demand", () => {
    expect(offenders).toEqual([]);
  });

  it("load the three.js classes through one module that is itself loaded on demand", () => {
    const stage = readFileSync(join(SRC, "features", "landing", "equity-stage.tsx"), "utf8");
    expect(stage).toMatch(/import\(\s*["']\.\/three-bits["']\s*\)/);
    expect(stage).not.toMatch(/from\s+["']\.\/three-bits["']/);
  });
});
