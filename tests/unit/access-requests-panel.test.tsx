import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }));
import { apiFetch } from "@/lib/api/client";
import { AccessRequestsPanel } from "@/features/admin/access-requests-panel";

const base = {
  tradingPlatform: "mt5",
  note: "I keep my journal in Excel",
  locale: "fa",
  createdAt: "2026-10-01T08:30:00.000Z",
  updatedAt: "2026-10-01T08:30:00.000Z"
};
const rows = [
  { ...base, id: "r-new", name: "Sara Trader", email: "sara@example.com", status: "new" },
  { ...base, id: "r-inv", name: "Omid Invited", email: "omid@example.com", status: "invited", tradingPlatform: "other", note: null, locale: "en" },
  { ...base, id: "r-dec", name: "Dina Declined", email: "dina@example.com", status: "declined", tradingPlatform: null }
];

/** What the admin list API answers: the newest requests and how many there are in all. */
const page = (items: unknown[], total = items.length) => ({ items, total });

const rowOf = (name: string) => screen.getByText(name).closest("li") as HTMLElement;

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue(page(rows) as never);
});
afterEach(cleanup);

describe("AccessRequestsPanel list", () => {
  it("shows name, e-mail, platform, note, date and status of each request", async () => {
    render(<AccessRequestsPanel locale="en" />);

    expect(await screen.findByText("Sara Trader")).toBeInTheDocument();
    const sara = within(rowOf("Sara Trader"));
    expect(sara.getByText("sara@example.com")).toHaveAttribute("dir", "ltr");
    expect(sara.getByText("MT5")).toBeInTheDocument();
    expect(sara.getByText("I keep my journal in Excel")).toHaveAttribute("dir", "auto");
    expect(sara.getByText(new Date(base.createdAt).toLocaleString("en-US"), { exact: false })).toBeInTheDocument();
    expect(sara.getByText("New")).toBeInTheDocument();
    expect(within(rowOf("Omid Invited")).getByText("Invited")).toBeInTheDocument();
    expect(within(rowOf("Omid Invited")).getByText("Another platform")).toBeInTheDocument();
    expect(within(rowOf("Dina Declined")).getByText("Declined")).toBeInTheDocument();
  });

  it("asks for every request by default, and for one status when it is chosen", async () => {
    render(<AccessRequestsPanel locale="en" />);
    await screen.findByText("Sara Trader");
    expect(apiFetch).toHaveBeenCalledWith("/api/admin/access-requests");

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "new" } });

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/admin/access-requests?status=new"));
  });

  it("says so when there is nothing to show", async () => {
    vi.mocked(apiFetch).mockResolvedValue(page([]) as never);
    render(<AccessRequestsPanel locale="en" />);

    expect(await screen.findByText("No requests yet.")).toBeInTheDocument();
  });

  it("is written in Persian for the Persian admin page", async () => {
    render(<AccessRequestsPanel locale="fa" />);

    expect(await screen.findByText("Sara Trader")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "درخواست‌های دسترسی" })).toBeInTheDocument();
    const sara = within(rowOf("Sara Trader"));
    expect(sara.getByText("متاتریدر ۵ (MT5)")).toBeInTheDocument();
    expect(sara.getByText("جدید")).toBeInTheDocument();
    expect(sara.getByRole("button", { name: "ثبت به‌عنوان دعوت‌شده" })).toBeInTheDocument();
    expect(sara.getByRole("button", { name: "ثبت به‌عنوان ردشده" })).toBeInTheDocument();
    expect(sara.getByRole("button", { name: "حذف" })).toBeInTheDocument();
  });

  it("reminds the admin that marking a request sends nothing", async () => {
    render(<AccessRequestsPanel locale="en" />);

    expect(await screen.findByText(/marking a request sends nothing/i)).toBeInTheDocument();
  });

  it("renders nothing for a signed-out visitor or a non-admin", async () => {
    for (const status of [401, 403]) {
      vi.mocked(apiFetch).mockRejectedValue(Object.assign(new Error("no"), { status }));
      const { container, unmount } = render(<AccessRequestsPanel locale="en" />);
      await waitFor(() => expect(apiFetch).toHaveBeenCalled());
      await waitFor(() => expect(container.textContent).toBe(""));
      unmount();
      vi.mocked(apiFetch).mockClear();
    }
  });

  it("shows a load failure instead of an empty list", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("Database down"));
    render(<AccessRequestsPanel locale="en" />);

    expect(await screen.findByText("Database down")).toBeInTheDocument();
  });
});

describe("AccessRequestsPanel when the list is cut", () => {
  it("says it shows the newest requests out of the total", async () => {
    vi.mocked(apiFetch).mockResolvedValue(page(rows, 1234) as never);
    render(<AccessRequestsPanel locale="en" />);

    expect(await screen.findByText("Showing the newest 3 of 1,234 requests.")).toBeInTheDocument();
  });

  it("says it in Persian with Persian digits", async () => {
    vi.mocked(apiFetch).mockResolvedValue(page(rows, 1234) as never);
    render(<AccessRequestsPanel locale="fa" />);

    const note = `فقط جدیدترین ${(3).toLocaleString("fa-IR")} درخواست از مجموع ${(1234).toLocaleString("fa-IR")} درخواست نمایش داده می‌شود.`;
    expect(await screen.findByText(note)).toBeInTheDocument();
  });

  it("says nothing when every request is on the screen", async () => {
    render(<AccessRequestsPanel locale="en" />);
    await screen.findByText("Sara Trader");

    expect(screen.queryByText(/Showing the newest/)).not.toBeInTheDocument();
  });
});

describe("AccessRequestsPanel hostile text", () => {
  const RLO = String.fromCodePoint(0x202e);

  it("isolates the name and the note with bdi, so a direction override cannot reorder the line around them", async () => {
    const hostile = { ...rows[0], id: "r-bidi", name: `${RLO}Eve Mallory`, note: `${RLO}please invite me` };
    vi.mocked(apiFetch).mockResolvedValue(page([hostile]) as never);
    render(<AccessRequestsPanel locale="en" />);

    const name = await screen.findByText(`${RLO}Eve Mallory`);
    expect(name.tagName).toBe("BDI");
    const note = screen.getByText(`${RLO}please invite me`);
    expect(note.tagName).toBe("BDI");
    expect(note.closest("p")).toHaveAttribute("dir", "auto");
  });

  it("lets a long name without spaces wrap instead of running out of the row", async () => {
    const long = "W".repeat(80);
    vi.mocked(apiFetch).mockResolvedValue(page([{ ...rows[0], id: "r-long", name: long }]) as never);
    render(<AccessRequestsPanel locale="en" />);

    const name = await screen.findByText(long);
    expect(name.parentElement?.className).toContain("break-words");
    expect(name.parentElement?.className).toContain("min-w-0");
    expect(screen.getByText("sara@example.com", { exact: false }).className).toContain("break-all");
  });

  it("shows a name with markup as text, never as elements", async () => {
    const markup = "<img src=x onerror=alert(1)>";
    vi.mocked(apiFetch).mockResolvedValue(
      page([{ ...rows[0], id: "r-xss", name: markup, note: "<script>alert(1)</script><b>bold</b>" }]) as never
    );
    const { container } = render(<AccessRequestsPanel locale="en" />);

    expect(await screen.findByText(markup)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("<script>alert(1)</script><b>bold</b>")).toBeInTheDocument();
  });
});

describe("AccessRequestsPanel error text", () => {
  const apiError = (message: string, status: number, code: string) => Object.assign(new Error(message), { status, code });

  it("never shows the server's English text on the Persian page: a failed load says so in Persian", async () => {
    vi.mocked(apiFetch).mockRejectedValue(apiError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR"));
    const { container } = render(<AccessRequestsPanel locale="fa" />);

    expect(await screen.findByText("بارگذاری درخواست‌ها انجام نشد. دوباره تلاش کنید.")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/unexpected|server error/i);
  });

  it("never shows the server's English text on the Persian page: a failed decision says so in Persian", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(page(rows) as never);
    vi.mocked(apiFetch).mockRejectedValueOnce(apiError("Access request not found", 404, "NOT_FOUND"));
    vi.mocked(apiFetch).mockResolvedValueOnce(page(rows) as never);
    const { container } = render(<AccessRequestsPanel locale="fa" />);

    fireEvent.click(within(await waitForRow("Sara Trader")).getByRole("button", { name: "ثبت به‌عنوان ردشده" }));

    expect(await screen.findByText("این تغییر انجام نشد. دوباره تلاش کنید.")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/not found/i);
  });

  it("uses the shared Persian wording for the rate limit and for a lost connection", async () => {
    vi.mocked(apiFetch).mockRejectedValue(apiError("Too many requests. Please try again later.", 429, "RATE_LIMITED"));
    const first = render(<AccessRequestsPanel locale="fa" />);
    expect(await screen.findByText("تعداد تلاش‌ها زیاد بود. کمی بعد دوباره تلاش کنید.")).toBeInTheDocument();
    first.unmount();

    vi.mocked(apiFetch).mockRejectedValue(new TypeError("Failed to fetch"));
    render(<AccessRequestsPanel locale="fa" />);
    expect(await screen.findByText("اتصال به سرور برقرار نشد. اینترنت خود را بررسی کنید و دوباره تلاش کنید.")).toBeInTheDocument();
  });

  it("hides a 500 from the English page too and shows its own wording instead", async () => {
    vi.mocked(apiFetch).mockRejectedValue(apiError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR"));
    render(<AccessRequestsPanel locale="en" />);

    expect(await screen.findByText("Could not load the requests. Try again.")).toBeInTheDocument();
    expect(screen.queryByText("Unexpected server error")).not.toBeInTheDocument();
  });

  it("shows the server's plain message for a client error on the English page (a missing request)", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(page(rows) as never);
    vi.mocked(apiFetch).mockRejectedValueOnce(apiError("Access request not found", 404, "NOT_FOUND"));
    vi.mocked(apiFetch).mockResolvedValueOnce(page(rows) as never);
    render(<AccessRequestsPanel locale="en" />);

    fireEvent.click(within(await waitForRow("Sara Trader")).getByRole("button", { name: "Mark declined" }));

    expect(await screen.findByText("Access request not found")).toBeInTheDocument();
  });
});

describe("AccessRequestsPanel decisions", () => {
  it("offers the two other statuses for each request, and Back to new once it was answered", async () => {
    render(<AccessRequestsPanel locale="en" />);
    await screen.findByText("Sara Trader");

    const names = (name: string) => within(rowOf(name)).getAllByRole("button").map((button) => button.textContent);
    expect(names("Sara Trader")).toEqual(["Mark invited", "Mark declined", "Delete"]);
    expect(names("Omid Invited")).toEqual(["Mark declined", "Back to new", "Delete"]);
    expect(names("Dina Declined")).toEqual(["Mark invited", "Back to new", "Delete"]);
  });

  it("marks a request invited and reloads the list", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(page(rows) as never);
    vi.mocked(apiFetch).mockResolvedValueOnce({ ...rows[0], status: "invited" } as never);
    vi.mocked(apiFetch).mockResolvedValueOnce(page(rows) as never);
    render(<AccessRequestsPanel locale="en" />);

    fireEvent.click(within(await waitForRow("Sara Trader")).getByRole("button", { name: "Mark invited" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(3));
    const [path, init] = vi.mocked(apiFetch).mock.calls[1];
    expect(path).toBe("/api/admin/access-requests/r-new");
    expect((init as RequestInit).method).toBe("PATCH");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ status: "invited" });
  });

  it("moves a request back to new", async () => {
    render(<AccessRequestsPanel locale="en" />);

    fireEvent.click(within(await waitForRow("Omid Invited")).getByRole("button", { name: "Back to new" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String((vi.mocked(apiFetch).mock.calls[1][1] as RequestInit).body))).toEqual({ status: "new" });
  });

  it("shows the error and reloads when a decision fails", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(page(rows) as never);
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("Access request not found"));
    vi.mocked(apiFetch).mockResolvedValueOnce(page(rows) as never);
    render(<AccessRequestsPanel locale="en" />);

    fireEvent.click(within(await waitForRow("Sara Trader")).getByRole("button", { name: "Mark declined" }));

    expect(await screen.findByText("Access request not found")).toBeInTheDocument();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(3));
  });

  it("reloads with the filter chosen while a decision was running", async () => {
    let finish: (value: unknown) => void = () => undefined;
    vi.mocked(apiFetch).mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return new Promise((resolve) => (finish = resolve));
      return page(path.endsWith("status=invited") ? [rows[1]] : rows) as never;
    });
    render(<AccessRequestsPanel locale="en" />);
    fireEvent.click(within(await waitForRow("Sara Trader")).getByRole("button", { name: "Mark invited" }));
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "invited" } });
    finish({ ...rows[0], status: "invited" });

    const gets = () => vi.mocked(apiFetch).mock.calls.filter(([, init]) => !init).map(([path]) => path);
    await waitFor(() => expect(gets()).toHaveLength(3));
    expect(gets()[2]).toBe("/api/admin/access-requests?status=invited");
  });
});

describe("AccessRequestsPanel delete", () => {
  it("needs a second click before it deletes", async () => {
    render(<AccessRequestsPanel locale="en" />);
    const row = await waitForRow("Sara Trader");

    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    expect(apiFetch).toHaveBeenCalledTimes(1); // only the first load
    expect(within(row).getByRole("button", { name: "Confirm delete" })).toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(3));
    const [path, init] = vi.mocked(apiFetch).mock.calls[1];
    expect(path).toBe("/api/admin/access-requests/r-new");
    expect((init as RequestInit).method).toBe("DELETE");
  });

  it("can be cancelled", async () => {
    render(<AccessRequestsPanel locale="en" />);
    const row = await waitForRow("Sara Trader");

    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(row).getByRole("button", { name: "Cancel" }));

    expect(within(row).getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});

async function waitForRow(name: string) {
  await screen.findByText(name);
  return rowOf(name);
}
