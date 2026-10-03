import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(), isAuthError: () => false }));
import { apiFetch } from "@/lib/api/client";
import { TradeReviewEditor } from "@/features/journal/trade-review-editor";

afterEach(() => {
  cleanup();
  vi.mocked(apiFetch).mockReset();
});

const trade = {
  id: "t1",
  ruleFollowed: "followed" as const,
  lessonsLearned: "[خودکار · Claude] ریسک ۱٪ رعایت شد.",
  journalEntry: { lessonsLearned: "[خودکار · Claude] ریسک ۱٪ رعایت شد.", mistakes: ["حد ضرر دورتر شد"] }
};

const leg = (id: string, mistakes: string[]) => ({ ...trade, id, journalEntry: { ...trade.journalEntry, mistakes } });
const entry = [trade, leg("t2", ["late exit"]), leg("t3", [])];

function open(entryTrades = entry, onSaved = vi.fn(), locale: "en" | "fa" = "en") {
  render(<TradeReviewEditor trade={trade} entryTrades={entryTrades} locale={locale} onSaved={onSaved} />);
  fireEvent.click(screen.getByRole("button", { name: /edit review|ویرایش مرور/i }));
  return onSaved;
}

function fill() {
  fireEvent.change(screen.getByLabelText(/rule verdict/i), { target: { value: "broken" } });
  fireEvent.change(screen.getByLabelText(/lesson/i), { target: { value: "Moved my stop away." } });
  fireEvent.change(screen.getByLabelText(/mistakes/i), { target: { value: "stop widened، late exit, " } });
}

const sentBodies = () => (apiFetch as Mock).mock.calls.map((call) => ({ url: call[0], method: call[1].method, body: JSON.parse(call[1].body) }));

describe("TradeReviewEditor", () => {
  it("starts from the trade's current review and says when it was written automatically", () => {
    open();

    expect((screen.getByLabelText(/rule verdict/i) as HTMLSelectElement).value).toBe("followed");
    expect((screen.getByLabelText(/lesson/i) as HTMLTextAreaElement).value).toBe(trade.lessonsLearned);
    expect((screen.getByLabelText(/mistakes/i) as HTMLInputElement).value).toBe("حد ضرر دورتر شد");
    expect(screen.getByText(/written automatically/i)).toBeInTheDocument();
  });

  it("saves the review to every leg of the entry", async () => {
    vi.mocked(apiFetch).mockImplementation(async (_url, init) => ({ trade: { id: JSON.parse(String(init?.body)).id } }) as never);
    const onSaved = open();
    fill();
    fireEvent.click(screen.getByRole("button", { name: /save review/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const review = (mistakes: string[]) => ({
      ruleFollowed: "broken",
      lessonsLearned: "Moved my stop away.",
      journal: { ruleFollowed: "broken", lessonsLearned: "Moved my stop away.", mistakes }
    });
    // The edited leg gets exactly what was entered; the other legs keep their own tags, gain the added ones and
    // lose only the ones removed here.
    expect(sentBodies()).toEqual([
      { url: "/api/trades", method: "PATCH", body: { id: "t1", ...review(["stop widened", "late exit"]) } },
      { url: "/api/trades", method: "PATCH", body: { id: "t2", ...review(["late exit", "stop widened"]) } },
      { url: "/api/trades", method: "PATCH", body: { id: "t3", ...review(["stop widened", "late exit"]) } }
    ]);
    expect(onSaved.mock.calls[0][0].map((t: { id: string }) => t.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("saves only this leg when the entry option is turned off", async () => {
    vi.mocked(apiFetch).mockImplementation(async () => ({ trade: { id: "t1" } }) as never);
    const onSaved = open();
    fill();
    fireEvent.click(screen.getByLabelText(/apply to all 3 legs/i));
    fireEvent.click(screen.getByRole("button", { name: /save review/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(sentBodies().map((call) => call.body.id)).toEqual(["t1"]);
  });

  it("offers no entry option for a trade that is not part of a ladder", () => {
    open([trade]);

    expect(screen.queryByLabelText(/apply to all/i)).not.toBeInTheDocument();
  });

  it("shows the error and keeps the form when saving fails", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("Request validation failed"));
    const onSaved = open();
    fill();
    fireEvent.click(screen.getByRole("button", { name: /save review/i }));

    expect(await screen.findByText("Request validation failed")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/lesson/i)).toBeInTheDocument();
  });
});

describe("TradeReviewEditor partial saves and Persian digits", () => {
  it("keeps the legs that saved when a later leg fails, and says how many saved", async () => {
    vi.mocked(apiFetch)
      .mockImplementationOnce(async () => ({ trade: { id: "t1" } }) as never)
      .mockRejectedValueOnce(new Error("Too many requests"));
    const onSaved = open();
    fill();
    fireEvent.click(screen.getByRole("button", { name: /save review/i }));

    expect(await screen.findByText(/Saved 1 of 3 legs\. Too many requests/)).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledWith([{ id: "t1" }]);
  });

  it("writes the leg count in Persian digits", () => {
    open(entry, vi.fn(), "fa");

    expect(screen.getByText(/برای هر ۳ پله/)).toBeInTheDocument();
  });
});
