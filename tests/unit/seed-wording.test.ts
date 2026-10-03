import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const seed = readFileSync("prisma/seed.ts", "utf8");

// Product audit: a news source called "Local News" or "Local Context" reads like a developer's label. The built-in
// items are samples, and src/lib/services/news.ts already calls them "Nazm sample".
describe("seeded demo login", () => {
  it("creates the demo account under demo@nazm.example and prints the same login", () => {
    expect(seed.match(/email: "demo@nazm\.example"/g)).toHaveLength(2);
    expect(seed).toContain("Demo user: demo@nazm.example / DemoPassword123!");
  });

  // Both launchers run the seed on every start, so a database seeded before the rename gets its demo account renamed
  // in place first: the upsert below it then finds that account instead of adding a second, empty one.
  it("renames the former demo account before it upserts the demo user", () => {
    const rename = seed.indexOf("renameFormerDemoAccount(prisma)");
    const upsert = seed.indexOf("prisma.user.upsert");
    expect(rename).toBeGreaterThan(-1);
    expect(upsert).toBeGreaterThan(rename);
    expect(seed).toContain('from "@/lib/services/demo-account"');
    expect(seed).not.toMatch(/trademaster/i);
  });
});

describe("seeded news source", () => {
  it("is named a sample, like the built-in news provider", () => {
    const sources = [...seed.matchAll(/\bsource:\s*"([^"]+)"/g)].map((match) => match[1]);
    expect(sources).toEqual(["Nazm sample"]);
  });

  it("no longer carries a developer's 'local context' label", () => {
    expect(seed).not.toContain("Nazm Local Context");
    expect(seed).not.toContain("Nazm Local News");
  });

  // The summary is what the news page prints under the title: it reads as a news line, not as a note about fallbacks.
  it("summarizes the news item in a reader's words", () => {
    const summaries = [...seed.matchAll(/\bsummary:\s*"([^"]+)"/g)].map((match) => match[1]);
    expect(summaries.length).toBeGreaterThan(0);
    for (const summary of summaries) expect(summary).not.toMatch(/fallback|local context|context item/i);
  });
});
