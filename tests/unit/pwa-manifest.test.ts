import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { brand } from "@/lib/brand";

const root = process.cwd();

type Manifest = {
  name: string;
  short_name: string;
  description: string;
  display: string;
  start_url: string;
  icons: { src: string; sizes: string; purpose?: string }[];
};

const manifest = () => JSON.parse(readFileSync(join(root, "public/manifest.webmanifest"), "utf8")) as Manifest;

describe("pwa manifest", () => {
  // Two files for one URL made `next dev` answer 500 ("conflicting public file and page file") and left a production
  // build serving only the public one. The public file is the one source.
  it("has one source: the public file, with no app/manifest route beside it", () => {
    expect(existsSync(join(root, "public/manifest.webmanifest"))).toBe(true);
    for (const file of ["src/app/manifest.ts", "src/app/manifest.tsx", "src/app/manifest.js", "src/app/manifest.webmanifest"]) {
      expect(existsSync(join(root, file)), file).toBe(false);
    }
  });

  it("declares an installable standalone app with icons", () => {
    const m = manifest();
    expect(m.short_name).toBe("Nazm");
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
  });

  it("carries the product's name and a plain description of what it is", () => {
    const m = manifest();
    expect(m.name).toBe(brand.en.tagline);
    expect(m.short_name).toBe(brand.en.name);
    expect(m.description).toBe("Plan, journal, review, and improve your trading discipline.");
    expect(JSON.stringify(m)).not.toMatch(/trademaster|discipline os/i);
  });

  it("lists only icons that exist, at the size each one says", () => {
    for (const icon of manifest().icons) {
      const file = join(root, "public", icon.src);
      expect(existsSync(file), icon.src).toBe(true);
      // A PNG stores its width and height as two big-endian 32-bit numbers after the 8-byte signature and the IHDR header.
      const png = readFileSync(file);
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.src).toBe(icon.sizes);
    }
  });
});
