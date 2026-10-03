import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

vi.mock("@/lib/api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api/client")>()), apiFetch: vi.fn() }));
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { ReviewsScreen } from "@/features/reviews/reviews-screen";

const review = {
  id: "review_1",
  type: "daily",
  status: "open",
  periodStart: "2026-06-08T00:00:00.000Z",
  periodEnd: "2026-06-08T23:59:59.999Z",
  title: "مرور روزانه - ۱۸ خرداد ۱۴۰۵",
  checklist: [{ key: "write_one_lesson", label: "یک درس فرایندی برای مرور بعدی بنویسید.", completed: false }],
  metrics: null,
  insights: [],
  risks: [],
  lessons: [],
  nextActions: [],
  linkedTradeIds: [],
  linkedStrategyIds: [],
  completedAt: null,
  updatedAt: "2026-06-08T10:00:00.000Z"
};

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation(async (path: string) => {
    if (path === "/api/reviews/generate") return { review, reminder: null } as never;
    if (path === "/api/reviews") return { reviews: [review], focus: { review, overdueCount: 0, suggestedType: "daily" } } as never;
    return {} as never;
  });
});

/** The JSON body of the first call to a path, with its method. */
function bodyOf(path: string, method: string) {
  const call = vi.mocked(apiFetch).mock.calls.find(([url, init]) => url === path && (init as { method?: string } | undefined)?.method === method);
  return call ? JSON.parse((call[1] as { body: string }).body) : undefined;
}

describe("ReviewsScreen states in the page language", () => {
  it.each([
    ["fa", "در حال بارگذاری مرورها"],
    ["en", "Loading reviews"]
  ] as const)("says it is loading in the page language (%s)", (locale, text) => {
    vi.mocked(apiFetch).mockImplementation(() => new Promise(() => undefined));
    render(<ReviewsScreen locale={locale} messages={getMessages(locale)} />);

    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it.each([
    ["fa", "اجرای مرور انجام نشد"],
    ["en", "Review workflow failed"]
  ] as const)("shows its own sentence, not the server's text, when loading fails (%s)", async (locale, text) => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiClientError("PrismaClientKnownRequestError at reviews.ts:12", 500, "INTERNAL_ERROR"));
    const { container } = render(<ReviewsScreen locale={locale} messages={getMessages(locale)} />);

    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(container.textContent).not.toContain("Prisma");
  });

  it.each([
    [
      "fa",
      "ورود معاملات MT5",
      "ثبت معامله در ژورنال",
      "مرورهایی که می‌سازید اینجا نمایش داده می‌شوند: چک‌لیست، بینش‌هایی از رکوردهای شما",
      "مرور وقتی مفیدتر است که معامله‌ای در ژورنال داشته باشید"
    ],
    [
      "en",
      "Import MT5 trades",
      "Log a trade in the journal",
      "Reviews you generate appear here: a checklist, insights from your records",
      "They are most useful once you have trades in your journal"
    ]
  ] as const)("an empty list says what appears here, does not assume the user has no trades, and links to the next steps (%s)", async (locale, importLabel, journalLabel, description, usefulness) => {
    vi.mocked(apiFetch).mockImplementation(async () => ({ reviews: [], focus: { review: null, overdueCount: 0, suggestedType: "daily" } }) as never);
    const { container } = render(<ReviewsScreen locale={locale} messages={getMessages(locale)} />);

    expect(await screen.findByRole("link", { name: importLabel })).toHaveAttribute("href", `/${locale}/import`);
    expect(screen.getByRole("link", { name: journalLabel })).toHaveAttribute("href", `/${locale}/journal`);
    expect(container.textContent).toContain(description);
    expect(container.textContent).toContain(usefulness);
    expect(container.textContent).not.toContain("Once you have trades");
    expect(container.textContent).not.toContain("وقتی معامله‌ای در ژورنال داشته باشید، مرورها");
  });

  it.each([
    ["fa", "هنوز موردی ثبت نشده است."],
    ["en", "No records yet."]
  ] as const)("a review with no insights or risk notes says so in the page language (%s)", async (locale, text) => {
    const { container } = render(<ReviewsScreen locale={locale} messages={getMessages(locale)} />);

    await waitFor(() => expect(screen.getAllByText(text)).toHaveLength(2));
    if (locale === "fa") expect(container.textContent).not.toContain("No records yet");
  });
});

describe("ReviewsScreen language", () => {
  it.each(["fa", "en"] as const)("asks for a generated review in the language the screen shows (%s)", async (locale) => {
    render(<ReviewsScreen locale={locale} messages={getMessages(locale)} />);
    const generate = await screen.findByRole("button", { name: locale === "fa" ? "ایجاد مرور" : "Generate review" });

    fireEvent.click(generate);

    await waitFor(() => expect(bodyOf("/api/reviews/generate", "POST")).toBeDefined());
    expect(bodyOf("/api/reviews/generate", "POST")).toEqual({ type: "daily", createReminder: true, locale });
  });

  it.each(["fa", "en"] as const)("sends the language with a review update, so a carried-forward review is written in it (%s)", async (locale) => {
    render(<ReviewsScreen locale={locale} messages={getMessages(locale)} />);
    const carry = await screen.findByRole("button", { name: locale === "fa" ? "تکمیل و انتقال به مرور بعدی" : "Complete + carry forward" });

    fireEvent.click(carry);

    await waitFor(() => expect(bodyOf("/api/reviews", "PATCH")).toBeDefined());
    expect(bodyOf("/api/reviews", "PATCH")).toMatchObject({ id: "review_1", carryForward: true, locale });
  });

  it.each(["fa", "en"] as const)("sends the language with a reminder request (%s)", async (locale) => {
    render(<ReviewsScreen locale={locale} messages={getMessages(locale)} />);
    const reminder = await screen.findByRole("button", { name: locale === "fa" ? "ساخت یادآور" : "Create reminder" });

    fireEvent.click(reminder);

    await waitFor(() => expect(bodyOf("/api/reviews/review_1/reminder", "POST")).toBeDefined());
    expect(bodyOf("/api/reviews/review_1/reminder", "POST")).toEqual({ locale });
  });
});
