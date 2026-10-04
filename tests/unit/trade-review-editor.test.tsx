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
  lessonsLearned: "[خودکار] ریسک ۱٪ رعایت شد.",
  journalEntry: { lessonsLearned: "[خودکار] ریسک ۱٪ رعایت شد.", mistakes: ["حد ضرر دورتر شد"] }
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

// A failed save is worded by the editor in the page language: the server's English sentence never shows on the Persian page.
describe("TradeReviewEditor failed saves", () => {
  const failure = async (message: string, status: number, code: string) => {
    const { ApiClientError } = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
    return new ApiClientError(message, status, code);
  };
  const english = /[A-Za-z]{3,}/;

  it("shows no English server sentence on the Persian page", async () => {
    vi.mocked(apiFetch).mockRejectedValue(await failure("Trade not found", 404, "NOT_FOUND"));
    const { container } = render(<TradeReviewEditor trade={trade} entryTrades={[trade]} locale="fa" onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "ویرایش مرور" }));
    fireEvent.click(screen.getByRole("button", { name: "ذخیره مرور" }));

    expect(await screen.findByText("مرور ذخیره نشد.")).toBeInTheDocument();
    expect(container.textContent).not.toContain("Trade not found");
    expect(container.textContent).not.toMatch(english);
  });

  it("says in Persian that the requests were too many, and how many legs saved first", async () => {
    vi.mocked(apiFetch)
      .mockImplementationOnce(async () => ({ trade: { id: "t1" } }) as never)
      .mockRejectedValueOnce(await failure("Too many requests", 429, "RATE_LIMITED"));
    const onSaved = vi.fn();
    const { container } = render(<TradeReviewEditor trade={trade} entryTrades={entry} locale="fa" onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "ویرایش مرور" }));
    fireEvent.click(screen.getByRole("button", { name: "ذخیره مرور" }));

    expect(await screen.findByText(/۱ از ۳ پله ذخیره شد. تعداد تلاش‌ها زیاد بود/)).toBeInTheDocument();
    expect(container.textContent).not.toContain("Too many requests");
    expect(onSaved).toHaveBeenCalledWith([{ id: "t1" }]);
  });

  it("shows the server's own client-error sentence on the English page, and the editor's line for a server fault", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(await failure("Trade not found", 404, "NOT_FOUND"));
    open();
    fireEvent.click(screen.getByRole("button", { name: /save review/i }));
    expect(await screen.findByText("Trade not found")).toBeInTheDocument();
    cleanup();

    vi.mocked(apiFetch).mockRejectedValueOnce(await failure("Internal Server Error", 500, "INTERNAL"));
    open();
    fireEvent.click(screen.getByRole("button", { name: /save review/i }));
    expect(await screen.findByText("Could not save the review.")).toBeInTheDocument();
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

// Reviews written by a script start with a tag, and the tag does not name a vendor. Rows stored with the old tag
// (which did) are still recognised, and shown with the neutral one.
describe("TradeReviewEditor automatic-review tag", () => {
  const LEGACY = "[خودکار · Claude]";
  const withLesson = (lesson: string | null, id = "t1") => ({
    id,
    ruleFollowed: "followed" as const,
    lessonsLearned: lesson,
    journalEntry: { lessonsLearned: lesson, mistakes: [] as string[] }
  });
  const openFor = (lesson: string | null, locale: "en" | "fa" = "en") => {
    const one = withLesson(lesson);
    const view = render(<TradeReviewEditor trade={one} entryTrades={[one]} locale={locale} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /edit review|ویرایش مرور/i }));
    return view;
  };
  const note = /written automatically|به‌صورت خودکار/;

  it("notes a review that starts with the neutral tag", () => {
    openFor("[خودکار] ریسک رعایت شد.");
    expect(screen.getByText(note)).toBeInTheDocument();
  });

  it("still notes a review stored with the old tag, in both languages", () => {
    openFor(`${LEGACY} ریسک رعایت شد.`);
    expect(screen.getByText(note)).toBeInTheDocument();
    cleanup();
    openFor(`${LEGACY} ریسک رعایت شد.`, "fa");
    expect(screen.getByText(note)).toBeInTheDocument();
  });

  it("shows an old-tag review with the neutral tag: the vendor name is not on screen", () => {
    const { container } = openFor(`${LEGACY} ریسک رعایت شد.`);
    expect((screen.getByLabelText(/lesson/i) as HTMLTextAreaElement).value).toBe("[خودکار] ریسک رعایت شد.");
    expect(container.textContent).not.toContain("Claude");
    expect((screen.getByLabelText(/lesson/i) as HTMLTextAreaElement).value).not.toContain("Claude");
  });

  it("saves the neutral tag for a review that was stored with the old one", async () => {
    vi.mocked(apiFetch).mockImplementation(async () => ({ trade: { id: "t1" } }) as never);
    openFor(`${LEGACY} ریسک رعایت شد.`);
    fireEvent.click(screen.getByRole("button", { name: /save review/i }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(sentBodies()[0].body.lessonsLearned).toBe("[خودکار] ریسک رعایت شد.");
  });

  it("leaves a lesson the trader wrote alone", () => {
    openFor("Moved my stop away.");
    expect(screen.queryByText(note)).toBeNull();
    expect((screen.getByLabelText(/lesson/i) as HTMLTextAreaElement).value).toBe("Moved my stop away.");
  });

  it("does not treat the tag in the middle of a lesson as a mark, and does not touch it", () => {
    openFor(`I noted ${LEGACY} once`);
    expect(screen.queryByText(note)).toBeNull();
    expect((screen.getByLabelText(/lesson/i) as HTMLTextAreaElement).value).toBe(`I noted ${LEGACY} once`);
  });

  it("has no note for a trade with no lesson", () => {
    openFor(null);
    expect(screen.queryByText(note)).toBeNull();
  });
});
