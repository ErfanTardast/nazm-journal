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
      expect(container.textContent).not.toMatch(/demo user|demo walkthrough|conference|دموی کنفرانس|راهنمای نمایشی|حساب نمایشی/i);
      unmount();
    }
  });

  it("keeps the demo buttons in demo mode", () => {
    demo.DEMO_MODE = true;
    const { container } = render(<LandingScreen locale="en" />);
    expect([...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toContain("/en/demo");
  });

  // Every non-production run has demo mode on, so `npm run dev` shows this button first; it must not say "conference".
  it.each([
    ["en", "Open the demo walkthrough"],
    ["fa", "باز کردن راهنمای نمایشی"]
  ] as const)("names the %s demo button as the walkthrough, never a conference", (locale, label) => {
    demo.DEMO_MODE = true;
    const { container } = render(<LandingScreen locale={locale} />);
    const button = screen.getByRole("link", { name: label });
    expect(button.getAttribute("href")).toBe(`/${locale}/demo`);
    expect(container.textContent).not.toMatch(/conference|کنفرانس/i);
  });
});
