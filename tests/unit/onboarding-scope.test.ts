import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { productScopeForbiddenPatterns } from "@/lib/ai/guard";

const root = process.cwd();

/** The first-run surfaces and everything they say, in both languages. */
const files = [
  "src/features/onboarding/onboarding-screen.tsx",
  "src/features/onboarding/first-run-flow.tsx",
  "src/features/onboarding/choice-group.tsx",
  "src/features/onboarding/discipline-sprint.tsx",
  "src/features/onboarding/setup-checklist.tsx",
  "src/lib/onboarding/first-run.ts",
  "src/lib/onboarding/segmentation.ts",
  "src/messages/en.json",
  "src/messages/fa.json"
];

describe("the first run stays inside the product scope", () => {
  it("has no futures, signals, copy trading, execution, guaranteed profit, payment or subscription wording", () => {
    const offenders = files.flatMap((file) => {
      const content = readFileSync(join(root, file), "utf8");
      return productScopeForbiddenPatterns.filter((pattern) => pattern.test(content)).map((pattern) => `${file}: ${pattern.source}`);
    });
    expect(offenders).toEqual([]);
  });
});
