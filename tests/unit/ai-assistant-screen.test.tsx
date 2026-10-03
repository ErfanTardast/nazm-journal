import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

vi.mock("@/lib/api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api/client")>()), apiFetch: vi.fn() }));
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { AiAssistantScreen } from "@/features/ai/ai-assistant-screen";

const answer = {
  disclaimer: "d",
  mode: "professional_coach",
  summary: "خلاصه تست",
  observations: ["مشاهده تست"],
  risks: ["ریسک تست"],
  nextActions: ["اقدام تست"]
};

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({ insights: answer, review: answer, summary: answer } as never);
});

function sentBody(call = 0) {
  return JSON.parse((vi.mocked(apiFetch).mock.calls[call][1] as { body: string }).body);
}

describe("AiAssistantScreen language", () => {
  it.each(["fa", "en"] as const)("tells the coach which language the screen shows (%s) when a workflow runs", async (locale) => {
    const messages = getMessages(locale);
    render(<AiAssistantScreen locale={locale} messages={messages} />);

    // The journal workflow is the second tile; the run button follows the tile choice.
    fireEvent.click(screen.getAllByRole("button")[1]);
    fireEvent.click(screen.getAllByRole("button").find((button) => /Run workflow|اجرای گردش‌کار/.test(button.textContent ?? ""))!);

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe("/api/ai/journal-insights");
    expect(sentBody()).toEqual({ mode: "professional_coach", locale });
  });

  it.each(["fa", "en"] as const)("sends the language with a trade review too (%s)", async (locale) => {
    const { container } = render(<AiAssistantScreen locale={locale} messages={getMessages(locale)} />);

    fireEvent.change(container.querySelector("input[name=symbol]")!, { target: { value: "EURUSD" } });
    fireEvent.change(container.querySelector("input[name=entryPrice]")!, { target: { value: "1.1" } });
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe("/api/ai/review-trade");
    expect(sentBody()).toMatchObject({ symbol: "EURUSD", locale });
  });

  it("shows the answer under Persian headings, with no English dev wording left on a Persian screen", async () => {
    const { container } = render(<AiAssistantScreen locale="fa" messages={getMessages("fa")} />);
    fireEvent.change(container.querySelector("input[name=symbol]")!, { target: { value: "EURUSD" } });
    fireEvent.change(container.querySelector("input[name=entryPrice]")!, { target: { value: "1.1" } });
    fireEvent.submit(container.querySelector("form")!);

    expect(await screen.findByText("خلاصه تست")).toBeInTheDocument();
    const page = container.textContent ?? "";
    for (const english of ["Summary", "Observations", "Risks", "Next actions", "Local fallback ready"]) {
      expect(page).not.toContain(english);
    }
    expect(page).toContain("اقدامات بعدی");
  });

  it("describes the other workflows in Persian too", () => {
    const { container } = render(<AiAssistantScreen locale="fa" messages={getMessages("fa")} />);
    fireEvent.click(screen.getAllByRole("button")[2]);

    expect(container.textContent).not.toMatch(/Create a weekly process review/);
    expect(container.textContent).toContain("مرور فرایند هفتگی");
  });

  it("says what the coach looks at and what it does, on the Persian page, with no developer wording", () => {
    const { container } = render(<AiAssistantScreen locale="fa" messages={getMessages("fa")} />);
    const page = container.textContent ?? "";

    expect(page).toContain("مربی، معاملات، قوانین و ژورنال شما را بررسی می‌کند تا الگوهای رفتاری، اشتباه‌های تکراری و نقاط قابل بهبود را پیدا کند.");
    expect(page).toContain("یادداشت معامله");
    expect(page).not.toContain("زمینه ژورنال");
    expect(page).not.toMatch(/جایگزین|توسعه|قطعی(?!ت)|معماری|ارائه‌دهنده|محلی|آفلاین/);
    expect(page).not.toMatch(/fallback|deterministic|provider|development/i);
  });

  it("says what the coach looks at and what it does, on the English page, with no implementation notes", () => {
    const { container } = render(<AiAssistantScreen locale="en" messages={getMessages("en")} />);
    const page = container.textContent ?? "";

    expect(page).toContain("The coach reviews your trades, rules and journal to find behavior patterns, repeated mistakes and areas to improve.");
    expect(page).not.toMatch(/fallback|deterministic|provider abstraction|offline|development|auditable/i);
  });

  it("tells the truth about where the journal goes: built-in rules by default, an outside service only when the site operator set one up", () => {
    const fa = render(<AiAssistantScreen locale="fa" messages={getMessages("fa")} />);
    expect(fa.container.textContent).toContain("مرورها با قواعد داخلی مربی انجام می‌شود");
    expect(fa.container.textContent).toContain("مدیر سایت");
    fa.unmount();

    const en = render(<AiAssistantScreen locale="en" messages={getMessages("en")} />);
    expect(en.container.textContent).toContain("Reviews run on the coach's built-in rules");
    expect(en.container.textContent).toContain("site operator");
  });

  it("names the Persian workflows بازبین ژورنال and بازبین استراتژی, not مرورگر (web browser)", () => {
    const { container } = render(<AiAssistantScreen locale="fa" messages={getMessages("fa")} />);

    expect(container.textContent).toContain("بازبین ژورنال");
    expect(container.textContent).toContain("بازبین استراتژی");
    expect(container.textContent).not.toContain("مرورگر");
  });

  it.each([
    ["fa", "ورود معاملات MT5", "ثبت معامله در ژورنال"],
    ["en", "Import MT5 trades", "Log a trade in the journal"]
  ] as const)("before any answer, points to the next step with links: import trades or write a journal entry (%s)", (locale, importLabel, journalLabel) => {
    render(<AiAssistantScreen locale={locale} messages={getMessages(locale)} />);

    expect(screen.getByRole("link", { name: importLabel })).toHaveAttribute("href", `/${locale}/import`);
    expect(screen.getByRole("link", { name: journalLabel })).toHaveAttribute("href", `/${locale}/journal`);
  });

  it("no longer shows a provider badge on an answer, in either language", async () => {
    for (const locale of ["fa", "en"] as const) {
      const { container, unmount } = render(<AiAssistantScreen locale={locale} messages={getMessages(locale)} />);
      fireEvent.change(container.querySelector("input[name=symbol]")!, { target: { value: "EURUSD" } });
      fireEvent.change(container.querySelector("input[name=entryPrice]")!, { target: { value: "1.1" } });
      fireEvent.submit(container.querySelector("form")!);

      await screen.findByText("خلاصه تست");
      expect(container.textContent).not.toMatch(/Local fallback|جایگزین محلی/);
      unmount();
    }
  });

  it("never prints raw server text on the Persian page when a workflow fails", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiClientError("Internal server exploded at db.ts:42", 500, "INTERNAL_ERROR"));
    const { container } = render(<AiAssistantScreen locale="fa" messages={getMessages("fa")} />);
    fireEvent.click(screen.getAllByRole("button")[1]);
    fireEvent.click(screen.getAllByRole("button").find((button) => /اجرای گردش‌کار/.test(button.textContent ?? ""))!);

    expect(await screen.findByText("اجرای گردش‌کار انجام نشد")).toBeInTheDocument();
    expect(container.textContent).not.toContain("exploded");
  });

  it("names the rejected fields in Persian when the trade form is refused as invalid", async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiClientError("Invalid request", 422, "VALIDATION_ERROR", { fieldErrors: { entryPrice: ["Required"] } })
    );
    const { container } = render(<AiAssistantScreen locale="fa" messages={getMessages("fa")} />);
    fireEvent.change(container.querySelector("input[name=symbol]")!, { target: { value: "EURUSD" } });
    fireEvent.change(container.querySelector("input[name=entryPrice]")!, { target: { value: "1.1" } });
    fireEvent.submit(container.querySelector("form")!);

    expect(await screen.findByText(/قیمت ورود/, { selector: "p" })).toBeInTheDocument();
    expect(container.textContent).not.toContain("Required");
  });

  it("keeps the English headings on an English screen", async () => {
    const { container } = render(<AiAssistantScreen locale="en" messages={getMessages("en")} />);
    fireEvent.change(container.querySelector("input[name=symbol]")!, { target: { value: "EURUSD" } });
    fireEvent.change(container.querySelector("input[name=entryPrice]")!, { target: { value: "1.1" } });
    fireEvent.submit(container.querySelector("form")!);

    await screen.findByText("خلاصه تست");
    for (const english of ["Summary", "Observations", "Risks", "Next actions"]) expect(container.textContent).toContain(english);
  });
});
