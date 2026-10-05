import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import { englishLeaks } from "./support/english-leaks";
import { emptyReport, servePerformance } from "./support/performance-report";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from "@/lib/api/client";
import { PerformanceScreen } from "@/features/performance/performance-screen";

const messages = { en: getMessages("en"), fa: getMessages("fa") };

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

const locales = ["en", "fa"] as const;

/*
 * Product audit item 11: a page with nothing on it says in one sentence what it is for, and points to the next step
 * (a link, or the form on the same page).
 */

describe("Performance with no closed trades", () => {
  const copy = {
    en: {
      title: "Not enough data yet",
      description: "After you import trades, your win rate, expectancy, drawdown and strategy results appear here.",
      actions: ["Import MT5 trades", "Log a trade in the journal"]
    },
    fa: {
      title: "هنوز داده کافی نیست",
      description: "بعد از ورود معاملات، نرخ برد، امید ریاضی، افت سرمایه و عملکرد استراتژی‌های شما اینجا نمایش داده می‌شود.",
      actions: ["ورود معاملات MT5", "ثبت معامله در ژورنال"]
    }
  } as const;

  it.each(locales)("explains what will appear and links to the import and the journal (%s)", async (locale) => {
    servePerformance(apiFetch as Mock, { all: emptyReport("all") });
    const { container } = render(<PerformanceScreen locale={locale} messages={messages[locale]} />);
    expect(await screen.findByText(copy[locale].title)).toBeInTheDocument();
    expect(screen.getByText(copy[locale].description)).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([...copy[locale].actions]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([`/${locale}/import`, `/${locale}/journal`]);
    expect(links[0].className).toContain("bg-primary");
    if (locale === "fa") expect(englishLeaks(container)).toEqual([]);
  });
});
