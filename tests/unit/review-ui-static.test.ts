import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

describe("review UI static coverage", () => {
  it("registers review navigation and page messages in English and Persian", () => {
    const en = JSON.parse(readFileSync(join(root, "src/messages/en.json"), "utf8")) as Record<string, Record<string, string>>;
    const fa = JSON.parse(readFileSync(join(root, "src/messages/fa.json"), "utf8")) as Record<string, Record<string, string>>;

    expect(en.nav.reviews).toBe("Review");
    expect(en.pages.reviews).toBe("Review");
    expect(fa.nav.reviews).toBe("مرور");
    expect(fa.pages.reviews).toBe("مرور");
  });

  it("has a localized reviews route and no forbidden product language in review UI", () => {
    expect(existsSync(join(root, "src/app/[locale]/reviews/page.tsx"))).toBe(true);

    const content = readFileSync(join(root, "src/features/reviews/reviews-screen.tsx"), "utf8");
    const forbidden = [/guaranteed profit/i, /trading signal/i, /auto trading/i, /copy trading/i, /broker connection/i, /exchange execution/i, /execute order/i];
    expect(forbidden.filter((pattern) => pattern.test(content))).toEqual([]);
  });

  it("dashboard readiness command center keeps protected state graceful", () => {
    const dashboard = readFileSync(join(root, "src/features/dashboard/dashboard-screen.tsx"), "utf8");
    expect(dashboard).toContain("AuthRequiredState");
    expect(dashboard).toContain("reviewFocus");
    expect(dashboard).toContain("Am I ready to trade today?");
    expect(dashboard).toContain("readiness.checks");
  });
});
