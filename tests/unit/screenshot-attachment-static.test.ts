import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

describe("screenshot attachment static coverage", () => {
  const journal = readFileSync(join(root, "src/features/journal/journal-screen.tsx"), "utf8");

  it("processes uploads through the image attachment helpers", () => {
    expect(journal).toContain("fileToCompressedDataUrl");
    expect(journal).toContain("validateImageFile");
  });

  it("submits the screenshot in the journal payload and renders it as an image", () => {
    expect(journal).toContain("screenshotUrl: screenshot ?? nullable(form.get(\"screenshotUrl\"))");
    expect(journal).toContain("<ScreenshotBlock");
    expect(journal).toMatch(/<img\s+src=\{url\}/);
  });

  it("caps the stored screenshot size in validation", () => {
    const validation = readFileSync(join(root, "src/lib/validation/trading.ts"), "utf8");
    expect(validation).toContain("screenshotUrl: z.string().url().max(1_500_000)");
  });
});
