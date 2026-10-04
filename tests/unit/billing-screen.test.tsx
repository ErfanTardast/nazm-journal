import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(), isAuthError: () => false }));
import { apiFetch } from "@/lib/api/client";
import { BillingScreen } from "@/features/billing/billing-screen";

// A made-up address in the right format (its checksum is invalid, so no wallet accepts it); never a real one.
const WALLET = "TNazmTestWa11etNotRea1XXXXXXXXXXXX";
const overview = {
  tier: "free",
  tierExpiresAt: null,
  refundWindowDays: 7,
  plans: {
    pro: { priceToman: 200000, priceUsdt: 5, periodDays: 30 },
    elite: { priceToman: 500000, priceUsdt: 12, periodDays: 30 }
  },
  methods: {
    card: { cardNumber: "0000000000000000", holder: "Sample Holder", bank: "Melli" },
    usdt: { address: WALLET, network: "TRC20" }
  },
  usdtIntent: null as null | { id: string; tier: string; amount: number; expiresAt: string },
  payments: [
    {
      id: "p1",
      tier: "pro",
      periodDays: 30,
      amount: 200000,
      currency: "toman",
      method: "card_to_card",
      trackingCode: "123456789012",
      paidAt: "2026-09-30T10:00:00.000Z",
      status: "pending",
      reviewedAt: null,
      reviewNote: null,
      createdAt: "2026-09-30T10:05:00.000Z"
    }
  ]
};
const intent = { id: "i1", tier: "elite", amount: 12.01, expiresAt: "2026-10-02T10:00:00.000Z" };

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});
afterEach(cleanup);

function calls() {
  return vi.mocked(apiFetch).mock.calls.map(([path, init]) => ({ path, body: init ? JSON.parse(String((init as RequestInit).body)) : null }));
}

describe("BillingScreen", () => {
  it("shows prices, both transfer destinations and the user's submissions", async () => {
    vi.mocked(apiFetch).mockResolvedValue(overview as never);
    render(<BillingScreen locale="en" />);
    expect(await screen.findByText("0000 0000 0000 0000")).toBeInTheDocument();
    expect(screen.getByText(WALLET)).toBeInTheDocument();
    expect(screen.getByText(/only on the TRC20/i)).toBeInTheDocument();
    expect(screen.getAllByText(/200,000 Toman/).length).toBeGreaterThan(0);
    expect(screen.getByText("123456789012")).toBeInTheDocument();
    expect(screen.getByText("Waiting for review")).toBeInTheDocument();
  });

  it("asks for the bank reference number for card transfers and states the Toman amount", async () => {
    vi.mocked(apiFetch).mockResolvedValue(overview as never);
    render(<BillingScreen locale="en" />);
    expect(await screen.findByLabelText(/reference number/i)).toBeInTheDocument();
    expect(screen.getByText(/Transfer 200,000 Toman/)).toBeInTheDocument();
  });

  it("reserves an exact USDT amount before the transfer, then submits the hash with that reservation", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(overview as never)
      .mockResolvedValueOnce(intent as never)
      .mockResolvedValueOnce({ id: "i1", status: "pending" } as never)
      .mockResolvedValueOnce({ ...overview, usdtIntent: null } as never);
    render(<BillingScreen locale="en" />);
    await screen.findByText(WALLET);

    fireEvent.change(screen.getByLabelText("Plan"), { target: { value: "elite" } });
    fireEvent.change(screen.getByLabelText("Method"), { target: { value: "usdt_trc20" } });
    expect(screen.getByRole("button", { name: "Submit for review" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Get my exact amount" }));
    expect((await screen.findAllByText(/Send exactly 12\.01 USDT/)).length).toBeGreaterThan(0);
    expect(calls()[1]).toEqual({ path: "/api/billing/usdt-intents", body: { tier: "elite" } });

    fireEvent.change(screen.getByLabelText("Transaction hash"), { target: { value: "D".repeat(64) } });
    fireEvent.change(screen.getByLabelText("Time of transfer"), { target: { value: "2026-09-30T10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(4));
    expect(calls()[2].path).toBe("/api/billing/payments");
    expect(calls()[2].body).toMatchObject({ tier: "elite", method: "usdt_trc20", trackingCode: "d".repeat(64), intentId: "i1" });
    expect(await screen.findByText(/submitted/i)).toBeInTheDocument();
  });

  it("shows an open reservation right away", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ...overview, usdtIntent: { ...intent, tier: "pro", amount: 5.03 } } as never);
    render(<BillingScreen locale="en" />);
    expect((await screen.findAllByText(/Send exactly 5\.03 USDT/)).length).toBeGreaterThan(0);
  });

  it("keeps the confirmation when refreshing the list fails after a successful submit", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ ...overview, payments: [] } as never)
      .mockResolvedValueOnce({ id: "p2", status: "pending" } as never)
      .mockRejectedValueOnce(new Error("network down"));
    render(<BillingScreen locale="en" />);
    await screen.findByText(WALLET);
    fireEvent.change(screen.getByLabelText(/reference number/i), { target: { value: "۱۲۳۴۵۶۷۸۹۰۱۲" } });
    fireEvent.change(screen.getByLabelText("Time of transfer"), { target: { value: "2026-09-30T10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(await screen.findByText(/submitted/i)).toBeInTheDocument();
    expect(calls()[1].body).toMatchObject({ trackingCode: "123456789012" });
    expect(screen.getByText(WALLET)).toBeInTheDocument();
  });

  it("says purchases are not open when no method is configured", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ...overview, methods: { card: null, usdt: null }, payments: [] } as never);
    render(<BillingScreen locale="en" />);
    expect(await screen.findByText(/not open yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit for review" })).toBeDisabled();
  });

  it("renders in Persian", async () => {
    vi.mocked(apiFetch).mockResolvedValue(overview as never);
    render(<BillingScreen locale="fa" />);
    expect(await screen.findByText("پلن‌ها و پرداخت")).toBeInTheDocument();
    expect(screen.getByText("در انتظار بررسی")).toBeInTheDocument();
  });

  it("calls the active-plans limit by the glossary word, not برنامه", async () => {
    vi.mocked(apiFetch).mockResolvedValue(overview as never);
    const { container } = render(<BillingScreen locale="fa" />);
    await screen.findByText("پلن‌ها و پرداخت");
    // One line per tier (free, pro, elite).
    expect(screen.getAllByText(/^پلن‌های فعال:/)).toHaveLength(3);
    expect(container.textContent).not.toContain("برنامه‌های فعال");
    expect(container.textContent).not.toMatch(/برنامه(?!‌ریز)/);
  });
});
