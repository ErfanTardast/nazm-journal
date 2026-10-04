import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import config from "../../tailwind.config";

/*
 * `next dev` printed "The `min-*` and `max-*` variants are not supported with a `screens` configuration containing mixed
 * units" on the first request. Tailwind reads every file in `content` for anything that looks like a class, so a test
 * sentence such as "needs a max-[Npx]:sr-only rule" counted as the class `max-[Npx]:sr-only`: its unit "Npx" is not the
 * "px" of the default screens.
 */
const root = process.cwd();

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("tailwind content", () => {
  it("is the app's own files: test files, which name classes in sentences, are not scanned", () => {
    const globs = config.content as string[];
    expect(globs.length).toBeGreaterThan(0);
    expect(globs.filter((glob) => glob.includes("tests"))).toEqual([]);
    expect(globs.every((glob) => glob.startsWith("./src/"))).toBe(true);
  });

  it("uses no min-[...] or max-[...] screen variant in a unit other than px, which the default screens use", () => {
    const offenders = sources(join(root, "src")).flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return Array.from(text.matchAll(/(?<![\w-])(?:min|max)-\[([^\]\s]*)\]:/g))
        .filter((match) => !/^\d+(\.\d+)?px$/.test(match[1]))
        .map((match) => `${file.slice(root.length + 1)}: ${match[0]}`);
    });
    expect(offenders).toEqual([]);
  });

  it("does not override the default screens, whose units are all px", () => {
    expect(config.theme?.screens).toBeUndefined();
    expect(config.theme?.extend && "screens" in config.theme.extend).toBe(false);
  });
});
