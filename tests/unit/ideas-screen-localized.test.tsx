import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import { englishLeaks } from "./support/english-leaks";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { IdeasScreen } from "@/features/ideas/ideas-screen";

const en = getMessages("en");
const fa = getMessages("fa");

// Ticker symbols (the form's placeholder lists two) stay in Latin letters.
const SYMBOLS = ["BTCUSDT", "ETHUSDT"];

const idea = {
  id: "i1",
  title: "بازگشت به محدوده",
  market: "crypto",
  symbols: ["BTCUSDT"],
  type: "setup_idea",
  status: "converted_to_plan",
  thesis: "قیمت به محدوده برگشت و باید مرور شود.",
  invalidation: null,
  confidence: 6,
  tags: ["نقدینگی"],
  updatedAt: "2026-09-29T10:00:00Z"
};

function serve(ideas: unknown[]) {
  (apiFetch as Mock).mockImplementation(async (path: string) => {
    if (path !== "/api/ideas") throw new Error(`Unexpected request ${path}`);
    return { ideas };
  });
}

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

describe("the ideas page in Persian", () => {
  it("has no English left: filters, market badge, status and type labels", async () => {
    serve([idea]);
    const { container } = render(<IdeasScreen locale="fa" messages={fa} />);
    await screen.findByText("بازگشت به محدوده");
    expect(englishLeaks(container, SYMBOLS)).toEqual([]);
    expect(screen.getAllByText("همه بازارها").length).toBeGreaterThan(0);
    expect(screen.getAllByText("همه وضعیت‌ها").length).toBeGreaterThan(0);
  });

  it("has no English in the empty state or the loading line", async () => {
    let finish: (value: unknown) => void = () => undefined;
    (apiFetch as Mock).mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const { container } = render(<IdeasScreen locale="fa" messages={fa} />);
    expect(englishLeaks(container, SYMBOLS)).toEqual([]);
    expect(container.textContent).toContain("در حال بارگذاری ایده‌ها");
    finish({ ideas: [] });
    await screen.findByText("هنوز ایده‌ای نیست");
    expect(englishLeaks(container, SYMBOLS)).toEqual([]);
  });

  it("calls a plan پلن, never برنامه", async () => {
    serve([idea]);
    const { container } = render(<IdeasScreen locale="fa" messages={fa} />);
    await screen.findByText("بازگشت به محدوده");
    // The status of an idea that became a plan, and the page description.
    expect(screen.getAllByText("تبدیل‌شده به پلن").length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/برنامه(?!‌ریز)/);
  });

  it("keeps the search icon on the reading side of the field", async () => {
    serve([idea]);
    const { container } = render(<IdeasScreen locale="fa" messages={fa} />);
    await screen.findByText("بازگشت به محدوده");
    const search = container.querySelector("svg.lucide-search") as SVGElement;
    expect(search.getAttribute("class")).toContain("start-3");
    expect(search.getAttribute("class")).not.toMatch(/\bleft-3\b/);
  });
});

describe("ideas errors are shown in the page language", () => {
  const server500 = new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR");

  it("a failed load: Persian card, never the server's text", async () => {
    (apiFetch as Mock).mockRejectedValue(server500);
    const { container } = render(<IdeasScreen locale="fa" messages={fa} />);
    await screen.findByText("ایده‌ها در دسترس نیستند");
    expect(container.textContent).not.toContain("Unexpected server error");
    expect(englishLeaks(container, SYMBOLS)).toEqual([]);
  });

  it("a failed load (English): the screen's own sentence for a server error", async () => {
    (apiFetch as Mock).mockRejectedValue(server500);
    const { container } = render(<IdeasScreen locale="en" messages={en} />);
    await screen.findByText("Ideas unavailable");
    expect(container.textContent).not.toContain("Unexpected server error");
    expect(container.textContent).toContain("The ideas could not be loaded");
  });

  it("a failed save names the rejected fields in Persian, next to the save button", async () => {
    (apiFetch as Mock).mockImplementation(async (_path: string, init?: RequestInit) => {
      if (init?.method === "POST") throw new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { fieldErrors: { thesis: ["Too small"] } });
      return { ideas: [] };
    });
    render(<IdeasScreen locale="fa" messages={fa} />);
    const button = await screen.findByRole("button", { name: "ثبت ایده" });
    const form = button.closest("form") as HTMLFormElement;
    fireEvent.change(form.elements.namedItem("title") as HTMLInputElement, { target: { value: "ایده" } });
    fireEvent.change(form.elements.namedItem("thesis") as HTMLTextAreaElement, { target: { value: "فرضیه کوتاه" } });
    fireEvent.click(button);

    const alert = await screen.findByRole("alert");
    expect(form.contains(alert)).toBe(true);
    expect(alert).toHaveTextContent("فرضیه");
    expect(englishLeaks(alert)).toEqual([]);
    // The list stays; a save error is not a failed page.
    expect(screen.queryByText("ایده‌ها در دسترس نیستند")).toBeNull();
  });

  it("a failed save (English) says the idea could not be saved for a server error", async () => {
    (apiFetch as Mock).mockImplementation(async (_path: string, init?: RequestInit) => {
      if (init?.method === "POST") throw server500;
      return { ideas: [] };
    });
    render(<IdeasScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Capture idea" });
    const form = button.closest("form") as HTMLFormElement;
    fireEvent.change(form.elements.namedItem("title") as HTMLInputElement, { target: { value: "Range retest" } });
    fireEvent.change(form.elements.namedItem("thesis") as HTMLTextAreaElement, { target: { value: "Review whether it held." } });
    fireEvent.click(button);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The idea could not be saved");
    expect(alert.textContent).not.toContain("Unexpected server error");
  });
});
