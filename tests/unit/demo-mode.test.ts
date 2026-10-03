import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demoSeedAllowed, isDemoEnabled } from "@/lib/demo";

describe("isDemoEnabled", () => {
  it("is on outside production", () => {
    expect(isDemoEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(isDemoEnabled({ NODE_ENV: "test" })).toBe(true);
  });
  it("is off in production by default", () => {
    expect(isDemoEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(isDemoEnabled({ NODE_ENV: "production", NEXT_PUBLIC_DEMO_MODE: "false" })).toBe(false);
  });
  it("can be opted in for a production demo build", () => {
    expect(isDemoEnabled({ NODE_ENV: "production", NEXT_PUBLIC_DEMO_MODE: "true" })).toBe(true);
  });
});

describe("demoSeedAllowed", () => {
  it("seeds outside production", () => {
    expect(demoSeedAllowed({ NODE_ENV: "development" })).toBe(true);
  });

  it("never seeds the demo admin in production from a runtime NEXT_PUBLIC_DEMO_MODE alone", () => {
    expect(demoSeedAllowed({ NODE_ENV: "production", NEXT_PUBLIC_DEMO_MODE: "true" })).toBe(false);
  });

  it("seeds in production only when the image was built as a demo (the entrypoint passes DEMO_SEED)", () => {
    expect(demoSeedAllowed({ NODE_ENV: "production", NEXT_PUBLIC_DEMO_MODE: "true", DEMO_SEED: "true" })).toBe(true);
    expect(demoSeedAllowed({ NODE_ENV: "production", DEMO_SEED: "true" })).toBe(false);
  });
});

describe("docker entrypoint demo seed", () => {
  const entrypoint = readFileSync("scripts/docker-entrypoint.sh", "utf8");
  const dockerfile = readFileSync("Dockerfile", "utf8");

  it("decides from the flag baked in at build time, not from a runtime variable", () => {
    expect(dockerfile).toMatch(/\.build-demo-mode/);
    expect(entrypoint).toMatch(/\.build-demo-mode/);
    expect(entrypoint).not.toMatch(/\$\{?NEXT_PUBLIC_DEMO_MODE/);
    expect(entrypoint).toMatch(/DEMO_SEED=true/);
  });
});
