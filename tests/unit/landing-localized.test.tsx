import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@/lib/demo", () => ({ DEMO_MODE: false }));

import { LandingScreen } from "@/features/landing/landing-screen";

afterEach(cleanup);

// The first Persian screen once mixed in English sentences. The product's own name is written «نظم» here, so the
// R unit, platform names and instrument symbols are the only Latin text the Persian page may carry.
describe("LandingScreen in Persian", () => {
  it("has no English sentences left", () => {
    const { container } = render(<LandingScreen locale="fa" />);
    const text = (container.textContent ?? "")
      .replaceAll("CSV", "")
      .replace(/\b[A-Z]{6}\b/g, "");
    expect(text.match(/[A-Za-z]{3,}/g) ?? []).toEqual([]);
  });

  it("keeps the English page in English", () => {
    const { container } = render(<LandingScreen locale="en" />);
    expect(container.textContent).toContain("Request access");
    expect(container.textContent).toContain("Sample data");
    expect(container.textContent ?? "").not.toMatch(/[؀-ۿ]/);
  });
});
