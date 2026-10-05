import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { marketSchema } from "@/lib/validation/trading";
import { coreScopeForbiddenPatterns, productScopeForbiddenPatterns } from "@/lib/ai/guard";

const root = process.cwd();

/** Folders read whole: every .ts and .tsx file in them is guarded, so a new file needs no edit here. */
const scannedFolders = ["src/features/performance", "src/features/dashboard"];

function sourceFilesUnder(folder: string): string[] {
  return readdirSync(join(root, folder), { withFileTypes: true }).flatMap((entry) => {
    const path = `${folder}/${entry.name}`;
    if (entry.isDirectory()) return sourceFilesUnder(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}
const scannedFiles = scannedFolders.flatMap(sourceFilesUnder);

const activeSurfaceFiles = [
  "src/features/landing/landing-screen.tsx",
  "src/features/landing/landing-copy.ts",
  "src/features/landing/landing-motion.tsx",
  "src/features/landing/equity-stage.tsx",
  "src/features/demo/demo-screen.tsx",
  "src/features/admin/admin-screen.tsx",
  "src/features/ai/ai-assistant-screen.tsx",
  "src/features/alerts/alerts-screen.tsx",
  "src/features/backtesting/backtest-screen.tsx",
  "src/features/growth/growth-screen.tsx",
  "src/features/ideas/ideas-screen.tsx",
  "src/features/import/csv-import-screen.tsx",
  "src/features/journal/journal-screen.tsx",
  "src/features/journal/trade-review-editor.tsx",
  "src/features/learning/learning-screen.tsx",
  "src/features/news/news-screen.tsx",
  "src/features/portfolio/portfolio-screen.tsx",
  "src/features/reviews/reviews-screen.tsx",
  "src/features/risk/risk-screen.tsx",
  "src/features/risk/position-planner.tsx",
  "src/features/risk/plan-desk.tsx",
  "src/features/risk/plan-sizing-panel.tsx",
  "src/features/trade-plans/strategy-rules-panel.tsx",
  "src/features/trade-plans/limit-warnings.ts",
  "src/features/settings/settings-screen.tsx",
  "src/features/strategy/strategy-screen.tsx",
  "src/features/trade-plans/trade-plans-screen.tsx",
  "src/features/watchlists/watchlists-screen.tsx",
  "src/components/layout/app-shell.tsx",
  "src/lib/services/ai.ts",
  "src/lib/services/ai/local-copy.ts",
  "src/lib/services/reviews.ts",
  "src/lib/services/review-copy.ts",
  "src/messages/en.json",
  "src/messages/fa.json",
  ...scannedFiles
];

describe("product scope guardrails", () => {
  it("only accepts MVP markets", () => {
    expect(marketSchema.options).toEqual(["crypto", "forex", "stocks"]);
    expect(() => marketSchema.parse("futures")).toThrow();
  });

  it("reads every file of the folders it scans whole", () => {
    expect(scannedFiles).toEqual(expect.arrayContaining(["src/features/performance/performance-screen.tsx", "src/features/dashboard/dashboard-screen.tsx"]));
    expect(scannedFiles.every((file) => /\.tsx?$/.test(file))).toBe(true);
    expect(new Set(activeSurfaceFiles).size).toBe(activeSurfaceFiles.length);
  });

  it("keeps active UI surfaces inside the second-brain scope", () => {
    const forbidden = productScopeForbiddenPatterns;

    const offenders = activeSurfaceFiles.flatMap((file) => {
      const content = readFileSync(join(root, file), "utf8");
      return forbidden
        .filter((pattern) => pattern.test(content))
        .map((pattern) => `${file}: ${pattern.source}`);
    });

    expect(offenders).toEqual([]);
  });
});

describe("billing surface guardrails", () => {
  const billingSurfaceFiles = [
    "src/features/billing/billing-screen.tsx",
    "src/features/billing/admin-payments-panel.tsx",
    "src/app/[locale]/billing/page.tsx"
  ];

  it("keeps payment words forbidden on every trading surface", () => {
    for (const term of ["payment", "subscription"]) {
      expect(productScopeForbiddenPatterns.some((pattern) => pattern.test(term))).toBe(true);
    }
  });

  it("lets billing surfaces talk about payments but never signals or order execution", () => {
    expect(coreScopeForbiddenPatterns.some((pattern) => pattern.test("payment"))).toBe(false);
    const offenders = billingSurfaceFiles.flatMap((file) => {
      const content = readFileSync(join(root, file), "utf8");
      return coreScopeForbiddenPatterns.filter((pattern) => pattern.test(content)).map((pattern) => `${file}: ${pattern.source}`);
    });
    expect(offenders).toEqual([]);
  });
});
