import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");

/** The declarations of the first plain `selector { ... }` rule in globals.css. */
function rule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`no rule for ${selector} in globals.css`);
  return match[1];
}

/** The value of a custom property inside the first rule that matches `selector` (a literal, e.g. `html[lang="fa"]`). */
function fontStack(selector: string) {
  const value = rule(selector).match(/--font-sans:\s*([^;]+);/)?.[1];
  if (!value) throw new Error(`no --font-sans in ${selector}`);
  return value
    .split(",")
    .map((family) => family.trim().replace(/^"|"$/g, ""));
}

// Audit round 3: /{locale}#features landed with the section titles under the 69px sticky header.
describe("anchor links under the sticky header", () => {
  it("reserves room for the header on every in-page jump", () => {
    const padding = rule("html").match(/scroll-padding-top:\s*([\d.]+)rem/);
    expect(padding, "html needs scroll-padding-top in rem").not.toBeNull();
    // The header is about 4.3rem tall (a 2.75rem button, 2 x 0.75rem padding and the border): 5rem clears it with air.
    expect(Number(padding?.[1])).toBeGreaterThanOrEqual(5);
  });
});

// Audit round 3: the English stack listed "Aptos" and "Segoe UI" and then the Persian font. Only Windows has those two, so
// on Android, iOS, macOS and Linux English pages downloaded Vazirmatn just to draw Latin text.
describe("font stacks", () => {
  it("lets English pages reach the platform UI face before the Persian font", () => {
    const stack = fontStack(":root");
    expect(stack).toEqual(["Aptos", "Segoe UI", "system-ui", "-apple-system", "Roboto", "Vazirmatn", "Tahoma", "sans-serif"]);
    expect(stack.indexOf("system-ui")).toBeLessThan(stack.indexOf("Vazirmatn"));
  });

  it("keeps Persian pages leading with the Persian face", () => {
    expect(fontStack('html[lang="fa"]')[0]).toBe("Vazirmatn");
  });

  it("serves the font from a versioned file name, so it can be cached for a year", () => {
    const src = css.match(/@font-face\s*\{[^}]*url\("([^"]+)"\)/)?.[1] ?? "";
    expect(src).toBe("/fonts/vazirmatn/Vazirmatn-Variable.v1.woff2");
    expect(existsSync(`public${src}`)).toBe(true);
    expect(existsSync("public/fonts/vazirmatn/Vazirmatn-Variable.woff2")).toBe(false);
  });
});
