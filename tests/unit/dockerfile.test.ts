import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// `docker compose up --build` is the README's first command for a stranger. Its slow, network-bound step is the
// dependency install: on 2026-10-04 it died twice after 6-9 minutes with npm's "Exit handler never called!" and
// started again from nothing.
const dockerfile = readFileSync("Dockerfile", "utf8");
const install = dockerfile.split(/\r?\n/).find((line) => /^RUN\b.*\bnpm ci\b/.test(line)) ?? "";

describe("Dockerfile dependency install", () => {
  it("keeps npm's download cache between builds, so running the command again resumes", () => {
    expect(install).toMatch(/--mount=type=cache,target=\/root\/\.npm\b/);
  });

  it("retries slow downloads and skips the audit and funding requests", () => {
    expect(install).toMatch(/--fetch-retries=\d+/);
    expect(install).toMatch(/--fetch-retry-maxtimeout=\d+/);
    expect(install).toContain("--no-audit");
    expect(install).toContain("--no-fund");
  });

  it("points only at documents that are published", () => {
    expect(dockerfile).not.toContain("docs/DEPLOYMENT.md");
  });
});
