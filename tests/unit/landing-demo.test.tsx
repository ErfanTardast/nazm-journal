import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const demo = vi.hoisted(() => ({ DEMO_MODE: true }));
vi.mock("@/lib/demo", () => demo);

import { LandingScreen } from "@/features/landing/landing-screen";

afterEach(cleanup);

describe("LandingScreen demo credentials", () => {
  it("shows the demo login in demo mode", () => {
    demo.DEMO_MODE = true;
    render(<LandingScreen locale="en" />);
    expect(screen.getByText(/DemoPassword123!/)).toBeInTheDocument();
    expect(screen.getByText(/demo@nazm\.example/)).toBeInTheDocument();
  });

  it("never prints the demo password when demo mode is off", () => {
    demo.DEMO_MODE = false;
    const { container } = render(<LandingScreen locale="en" />);
    expect(container.textContent).not.toContain("DemoPassword123!");
  });
});

describe("LandingScreen calls to action", () => {
  it("points to sign-up and sign-in, never the hidden demo, when demo mode is off", () => {
    demo.DEMO_MODE = false;
    for (const locale of ["en", "fa"] as const) {
      const { container, unmount } = render(<LandingScreen locale={locale} />);
      const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));

      expect(hrefs).toContain(`/${locale}/register`);
      expect(hrefs).toContain(`/${locale}/login`);
      expect(hrefs.some((href) => href?.endsWith("/demo"))).toBe(false);
      expect(container.textContent).not.toMatch(/demo user|conference demo|دموی کنفرانس|حساب نمایشی/i);
      unmount();
    }
  });

  it("keeps the demo buttons in demo mode", () => {
    demo.DEMO_MODE = true;
    const { container } = render(<LandingScreen locale="en" />);
    expect([...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toContain("/en/demo");
  });
});
