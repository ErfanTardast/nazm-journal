import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("@/lib/demo", () => ({ DEMO_MODE: false }));

import { stageFormatters } from "@/features/landing/equity-stage";
import { LandingScreen } from "@/features/landing/landing-screen";

afterEach(cleanup);

// While the chart draws, the numbers count up from zero. A drawdown is a loss at every moment of that count.
describe("the hero chart's numbers", () => {
  it("shows a drawdown with a minus sign even at zero", () => {
    expect(stageFormatters("en").loss(0)).toBe("−0.0R");
    expect(stageFormatters("en").loss(4.6)).toBe("−4.6R");
    expect(stageFormatters("fa").loss(4.6)).toBe("−۴٫۶R");
  });
});

const hrefs = (container: HTMLElement) => [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));

// Product audit, 2026-10-01: the landing sold a journal; the product is a trader's operating system with three
// strengths (MT5 import, review and mistake detection, risk discipline), and sign-up is invite-only.
describe("Landing V2", () => {
  it("opens with the positioning and the two honest ways in", () => {
    const { container } = render(<LandingScreen locale="fa" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("سیستم عملیاتی معامله‌گر");
    expect(screen.getAllByRole("link", { name: "ثبت‌نام با کد دعوت" })[0].getAttribute("href")).toBe("/fa/register");
    expect(screen.getAllByRole("link", { name: "درخواست دسترسی" })[0].getAttribute("href")).toBe("/fa/request-access");
    expect(container.textContent).not.toContain("ساخت حساب رایگان");
  });

  it("puts the three main strengths right after the hero", () => {
    render(<LandingScreen locale="fa" />);
    const features = document.getElementById("features") as HTMLElement;
    const titles = within(features).getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titles).toHaveLength(3);
    expect(titles[0]).toContain("MT5");
    expect(titles[1]).toContain("اشتباه");
    expect(titles[2]).toContain("ریسک");
  });

  it("shows the loop as seven steps, with execution marked as outside the product", () => {
    render(<LandingScreen locale="fa" />);
    const how = document.getElementById("how") as HTMLElement;
    const steps = within(how).getAllByRole("listitem");
    expect(steps).toHaveLength(7);
    expect(steps[2].getAttribute("data-outside")).toBe("true");
    expect(steps[2].textContent).toContain("MT5");
    expect(steps.filter((step) => step.getAttribute("data-outside") === "true")).toHaveLength(1);
  });

  it("draws the hero chart from the sample month and says it is sample data", () => {
    render(<LandingScreen locale="fa" />);
    const stage = screen.getByRole("img", { name: /نمودار نمونه/ });
    expect(stage.querySelector("svg path")).not.toBeNull();
    expect(screen.getAllByText(/دادهٔ نمونه/).length).toBeGreaterThan(0);
    // The derived month result, in Persian digits.
    expect(document.body.textContent).toContain("۸٫۷");
  });

  it("has the sections the public menu links to", () => {
    render(<LandingScreen locale="fa" />);
    for (const id of ["how", "features", "privacy", "access"]) expect(document.getElementById(id)).not.toBeNull();
  });

  it("explains access as a private beta, with both paths", () => {
    render(<LandingScreen locale="fa" />);
    const access = document.getElementById("access") as HTMLElement;
    expect(access.textContent).toContain("بتای خصوصی");
    expect(hrefs(access)).toEqual(expect.arrayContaining(["/fa/register", "/fa/request-access", "/fa/login"]));
  });

  it("offers a signed-in visitor the workspace instead of sign-up", () => {
    const { container } = render(<LandingScreen locale="fa" signedIn />);
    expect(hrefs(container)).toContain("/fa/dashboard");
    expect(hrefs(container)).not.toContain("/fa/register");
    expect(hrefs(container)).not.toContain("/fa/request-access");
  });

  it("keeps the heading order: one h1, then h2 sections, with h3 only inside them", () => {
    const { container } = render(<LandingScreen locale="fa" />);
    const levels = [...container.querySelectorAll("h1, h2, h3")].map((heading) => Number(heading.tagName[1]));
    expect(levels[0]).toBe(1);
    levels.forEach((level, index) => {
      if (index) expect(level - levels[index - 1]).toBeLessThanOrEqual(1);
    });
  });

  it("labels each hero number before its value, and separates the unit with a real space", () => {
    const { container } = render(<LandingScreen locale="en" />);
    const groups = [...container.querySelectorAll("figure dl > div")];
    expect(groups).toHaveLength(4);
    groups.forEach((group) => expect(group.firstElementChild?.tagName).toBe("DT"));
    expect(container.querySelector("figure dl")?.textContent).toContain("4 times");
    // The caption belongs to the figure itself.
    expect(container.querySelector("figure > figcaption")).not.toBeNull();
  });

  it("says the journal stays on this server only when no outside AI service is set up", () => {
    const builtIn = render(<LandingScreen locale="en" externalAi={false} />);
    expect(builtIn.container.textContent).toContain("is not sent to an outside AI service");
    cleanup();
    const outside = render(<LandingScreen locale="en" externalAi />);
    expect(outside.container.textContent).not.toContain("is not sent to an outside AI service");
    expect(outside.container.textContent).toContain("an outside AI service");
    cleanup();
    const outsideFa = render(<LandingScreen locale="fa" externalAi />);
    expect(outsideFa.container.textContent).not.toContain("فرستاده نمی‌شود");
  });

  it("keeps the percent sign next to its number on the Persian daily-loss scale", () => {
    const { container } = render(<LandingScreen locale="fa" />);
    const scale = container.querySelector("[data-scale]") as HTMLElement;
    const numbers = [...scale.querySelectorAll("bdi")].map((node) => node.textContent);
    expect(numbers).toEqual(["۰٫۰٪", "۲٫۰٪"]);
    expect(scale.getAttribute("aria-hidden")).toBeNull();
  });

  it("does not claim the three sample views come from the hero's month", () => {
    const { container } = render(<LandingScreen locale="en" />);
    expect(container.textContent).not.toContain("built from the sample month");
    expect(container.textContent).not.toContain("how many R it cost");
  });

  it("is fully English on the English page", () => {
    const { container } = render(<LandingScreen locale="en" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("operating system");
    expect(screen.getAllByRole("link", { name: "Request access" })[0].getAttribute("href")).toBe("/en/request-access");
    expect(container.textContent ?? "").not.toMatch(/[؀-ۿ]/);
  });
});
