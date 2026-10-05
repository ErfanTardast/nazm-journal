import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import { englishLeaks } from "./support/english-leaks";
import { latinDigitStrings } from "./support/latin-digits";
import { fullReport, servePerformance } from "./support/performance-report";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { PerformanceScreen } from "@/features/performance/performance-screen";

const en = getMessages("en");
const fa = getMessages("fa");
const ARABIC_SCRIPT = /[؀-ۿ]/;
/** Latin on a Persian page that the test itself feeds in: the time zone (an IANA name), the symbols and the trader's own words. */
const ALLOWED = ["Asia/Tehran", "XAUUSD", "EURUSD", "US30", "GBPUSD", "USDJPY", "NAS100", "Breakout", "Pullback", "Trend pullback", "Late entry", "Moved stop", "Calm", "Rushed"];

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

/*
 * The Performance page on the Persian page: no English heading, stat label, column, group name or error line, and no
 * Latin digit anywhere a number is written. The server's own content is fed in as it really arrives: a whole
 * PerformanceReport.
 */

describe("PerformanceScreen in Persian", () => {
  function reportWithNotes() {
    const report = fullReport();
    report.context = { ...report.context, source: "sample" };
    report.summary = { ...report.summary, lowSample: true, unpricedClosed: 3, openTrades: 2, withoutR: 3, maxDrawdownPct: 0.0412 };
    return report;
  }

  it("has no English and no Latin digit in the whole page", async () => {
    servePerformance(apiFetch as Mock, { all: reportWithNotes() });
    const { container } = render(<PerformanceScreen locale="fa" messages={fa} />);
    await screen.findByRole("button", { name: "همه" });

    expect(englishLeaks(container, ALLOWED)).toEqual([]);
    expect(latinDigitStrings(container, ALLOWED)).toEqual([]);
  });

  it("has no English when the report cannot be loaded", async () => {
    (apiFetch as Mock).mockRejectedValue(new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR"));
    const { container } = render(<PerformanceScreen locale="fa" messages={fa} />);
    await waitFor(() => expect(container.textContent).toMatch(ARABIC_SCRIPT));
    expect(englishLeaks(container)).toEqual([]);
  });

  it("keeps the English words on the English page", async () => {
    servePerformance(apiFetch as Mock, { all: fullReport() });
    render(<PerformanceScreen locale="en" messages={en} />);
    expect(await screen.findByRole("button", { name: "30 days" })).toBeInTheDocument();
  });
});
