import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DemoModeBanner } from "@/components/layout/demo-mode-banner";
import { DemoScreen } from "@/features/demo/demo-screen";
import { getMessages } from "@/lib/i18n/messages";

afterEach(cleanup);

// The demo is for anyone who runs the app (npm run dev turns it on), not a conference: neutral words, and each language
// shows only its own words.
const demoWord = /conference|کنفرانس/i;

describe("the demo-mode banner", () => {
  it("says Demo mode and links the walkthrough in English", () => {
    const { container } = render(<DemoModeBanner locale="en" />);
    expect(container.textContent).toContain("Demo mode");
    const link = screen.getByRole("link", { name: "Open the walkthrough" });
    expect(link.getAttribute("href")).toBe("/en/demo");
    expect(container.textContent).not.toMatch(demoWord);
    expect(container.textContent).not.toContain("review-first");
  });

  it("says it all in Persian, with no English word, and names the page as the menu does", () => {
    const { container } = render(<DemoModeBanner locale="fa" />);
    const text = container.textContent ?? "";
    expect(text).toContain("حالت نمایشی");
    const link = screen.getByRole("link", { name: "باز کردن راهنمای نمایشی" });
    expect(link.getAttribute("href")).toBe("/fa/demo");
    expect(text).not.toMatch(/[A-Za-z]/);
    expect(text).not.toMatch(demoWord);
  });
});

describe("the banner's link and the page it opens", () => {
  it("call the page the same thing: the Persian link ends with the page's own title, the English one names the walkthrough", () => {
    const fa = render(<DemoModeBanner locale="fa" />);
    const faLink = fa.getByRole("link").textContent ?? "";
    cleanup();
    const faTitle = render(<DemoScreen locale="fa" messages={getMessages("fa")} />).getByRole("heading", { level: 1 }).textContent ?? "";
    expect(faLink.endsWith(faTitle)).toBe(true);
    cleanup();

    const en = render(<DemoModeBanner locale="en" />);
    const enLink = en.getByRole("link").textContent ?? "";
    cleanup();
    const enTitle = render(<DemoScreen locale="en" messages={getMessages("en")} />).getByRole("heading", { level: 1 }).textContent ?? "";
    expect(enLink).toContain("walkthrough");
    expect(enTitle).toContain("walkthrough");
  });
});

describe("the demo screen", () => {
  it.each(["en", "fa"] as const)("never calls the demo a conference demo (%s)", (locale) => {
    const { container } = render(<DemoScreen locale={locale} messages={getMessages(locale)} />);
    expect(container.textContent).not.toMatch(demoWord);
  });

  it("names the page in the page's own language, not through the nav label", () => {
    const en = render(<DemoScreen locale="en" messages={getMessages("en")} />);
    expect(en.getByRole("heading", { level: 1 }).textContent).toBe("Demo walkthrough");
    cleanup();
    const fa = render(<DemoScreen locale="fa" messages={getMessages("fa")} />);
    expect(fa.getByRole("heading", { level: 1 }).textContent).toBe("راهنمای نمایشی");
  });
});
