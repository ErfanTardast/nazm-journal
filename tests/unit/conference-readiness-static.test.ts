import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

describe("conference readiness static assets", () => {
  it("adds landing, demo, growth, and ideas routes", () => {
    for (const route of [
      "src/app/[locale]/page.tsx",
      "src/app/[locale]/demo/page.tsx",
      "src/app/[locale]/growth/page.tsx",
      "src/app/[locale]/ideas/page.tsx"
    ]) {
      expect(existsSync(join(root, route))).toBe(true);
    }
  });

  it("has installable PWA metadata and icons", () => {
    const manifest = JSON.parse(readFileSync(join(root, "public/manifest.webmanifest"), "utf8")) as {
      name: string;
      display: string;
      icons: { src: string }[];
    };
    expect(manifest.name).toBe("Nazm — the trader's discipline journal");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map((icon) => icon.src)).toEqual(
      expect.arrayContaining(["/icons/icon-192.png", "/icons/icon-512-maskable.png"])
    );
    expect(existsSync(join(root, "public/icons/icon-192.png"))).toBe(true);
    expect(existsSync(join(root, "public/icons/icon-512-maskable.png"))).toBe(true);
    expect(existsSync(join(root, "public/sw.js"))).toBe(true);
    expect(existsSync(join(root, "src/app/offline/page.tsx"))).toBe(true);
  });

  it("keeps Persian message files readable for new V3 routes", () => {
    const fa = readFileSync(join(root, "src/messages/fa.json"), "utf8");
    expect(fa).toContain("سیستم رشد");
    expect(fa).toContain("مخزن فرضیه‌ها");
    expect(fa).not.toContain("Ã˜");
    expect(fa).not.toContain("Ø");
    expect(fa).not.toContain("Â");
  });

  it("keeps journal and CSV import workflow copy production-readable", () => {
    const journal = readFileSync(join(root, "src/features/journal/journal-screen.tsx"), "utf8");
    const csvImport = readFileSync(join(root, "src/features/import/csv-import-screen.tsx"), "utf8");
    const combined = `${journal}\n${csvImport}`;

    expect(journal).toContain("What did you learn from this trade?");
    expect(journal).toContain("Trade dossier");
    expect(csvImport).toContain("Download sample CSV");
    expect(csvImport).toContain("Column mapping");

    for (const marker of ["Ø", "Ù", "Û", "Â", "Ã"]) {
      expect(combined).not.toContain(marker);
    }
  });
});
