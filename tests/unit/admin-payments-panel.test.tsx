import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }));
import { apiFetch } from "@/lib/api/client";
import { AdminPaymentsPanel } from "@/features/billing/admin-payments-panel";

const TX = "e".repeat(64);
const rows = [
  {
    id: "p1",
    tier: "pro",
    periodDays: 30,
    amount: 5,
    currency: "usdt",
    method: "usdt_trc20",
    trackingCode: TX,
    paidAt: "2026-09-30T10:00:00.000Z",
    status: "pending",
    reviewedAt: null,
    reviewNote: null,
    createdAt: "2026-09-30T10:05:00.000Z",
    userEmail: "trader@example.com",
    refundEligible: false
  }
];

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});
afterEach(cleanup);

describe("AdminPaymentsPanel", () => {
  it("lists pending transfers with a Tronscan link for USDT", async () => {
    vi.mocked(apiFetch).mockResolvedValue(rows as never);
    render(<AdminPaymentsPanel locale="en" />);
    expect(await screen.findByText("trader@example.com")).toBeInTheDocument();
    expect(screen.getByText("5 USDT")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /tronscan/i }).getAttribute("href")).toBe(`https://tronscan.org/#/transaction/${TX}`);
    expect(apiFetch).toHaveBeenCalledWith("/api/admin/payments?status=pending");
  });

  it("approves a transfer and reloads the list", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(rows as never);
    vi.mocked(apiFetch).mockResolvedValueOnce({ id: "p1", status: "approved" } as never);
    vi.mocked(apiFetch).mockResolvedValueOnce([] as never);
    render(<AdminPaymentsPanel locale="en" />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(3));
    const [path, init] = vi.mocked(apiFetch).mock.calls[1];
    expect(path).toBe("/api/admin/payments/p1");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ action: "approve" });
  });

  it("reminds the admin to match the exact USDT amount", async () => {
    vi.mocked(apiFetch).mockResolvedValue(rows as never);
    render(<AdminPaymentsPanel locale="en" />);
    expect(await screen.findByText(/exact amount/i)).toBeInTheDocument();
  });

  it("reloads the list and shows the error when an action fails", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(rows as never);
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("The payment was already reviewed"));
    vi.mocked(apiFetch).mockResolvedValueOnce([] as never);
    render(<AdminPaymentsPanel locale="en" />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByText("The payment was already reviewed")).toBeInTheDocument();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(3));
  });

  it("reloads with the filter chosen while an action was running", async () => {
    let finishAction: (value: unknown) => void = () => {};
    vi.mocked(apiFetch).mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST") return new Promise((resolve) => (finishAction = resolve));
      return (path.endsWith("status=pending") ? rows : []) as never;
    });
    render(<AdminPaymentsPanel locale="en" />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "approved" } });
    finishAction({ id: "p1", status: "approved" });
    const gets = () => vi.mocked(apiFetch).mock.calls.filter(([, init]) => !init).map(([path]) => path);
    // initial load, the load for the new filter, then the reload after the action
    await waitFor(() => expect(gets()).toHaveLength(3));
    expect(gets()[2]).toBe("/api/admin/payments?status=approved");
  });

  it("renders nothing for a non-admin", async () => {
    vi.mocked(apiFetch).mockRejectedValue(Object.assign(new Error("Admin access is required"), { status: 403 }));
    const { container } = render(<AdminPaymentsPanel locale="en" />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
