import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

// The end-to-end specs read the message files at load time. If they find them through the working directory, running
// Playwright from another folder (for example `npx playwright test -c ../../playwright.config.ts` inside tests/e2e) makes
// every spec fail to load with ENOENT. `--list` loads every spec without starting a browser, a server or a database.
describe("the end-to-end specs", () => {
  it("load from any working directory: playwright test --list run inside tests/e2e finds every spec", () => {
    const root = process.cwd();
    const specs = readdirSync(join(root, "tests/e2e")).filter((name) => name.endsWith(".spec.ts"));
    expect(specs.length).toBeGreaterThan(0);

    const result = spawnSync(
      process.execPath,
      [join(root, "node_modules/@playwright/test/cli.js"), "test", "-c", join(root, "playwright.config.ts"), "--list"],
      { cwd: join(root, "tests/e2e"), encoding: "utf8", timeout: 60_000 }
    );
    const output = `${result.stdout}${result.stderr}`;
    expect(output).not.toContain("ENOENT");
    expect(result.status).toBe(0);
    expect(output).toMatch(new RegExp(`Total: \\d+ tests? in ${specs.length} files?`));
  }, 90_000);
});
