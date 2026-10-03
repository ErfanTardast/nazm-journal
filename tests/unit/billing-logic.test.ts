import { describe, expect, it } from "vitest";
import { canPurchase, computeNewExpiry, isRefundEligible, tierAfterRefund } from "@/lib/billing/logic";
import {
  getCardDetails,
  getUsdtWallet,
  isValidTrackingCode,
  normalizeTrackingCode,
  PAID_PLANS,
  quote,
  REFUND_WINDOW_DAYS,
  reserveUsdtAmount,
  USDT_INTENT_TTL_HOURS
} from "@/lib/billing/plans";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-01T12:00:00Z");

describe("PAID_PLANS", () => {
  it("prices Pro and Elite in Toman for a fixed period", () => {
    expect(PAID_PLANS.pro.priceToman).toBeGreaterThan(0);
    expect(PAID_PLANS.elite.priceToman).toBeGreaterThan(PAID_PLANS.pro.priceToman);
    expect(PAID_PLANS.pro.periodDays).toBe(30);
    expect(REFUND_WINDOW_DAYS).toBe(7);
  });
});

describe("computeNewExpiry", () => {
  it("starts a new period from now when the user is on free", () => {
    const result = computeNewExpiry({ tier: "free", tierExpiresAt: null }, "pro", now);
    expect(result?.getTime()).toBe(now.getTime() + 30 * DAY);
  });

  it("extends from the current expiry when renewing the same active tier", () => {
    const current = new Date(now.getTime() + 10 * DAY);
    const result = computeNewExpiry({ tier: "pro", tierExpiresAt: current }, "pro", now);
    expect(result?.getTime()).toBe(current.getTime() + 30 * DAY);
  });

  it("starts from now when the previous plan already expired", () => {
    const result = computeNewExpiry({ tier: "pro", tierExpiresAt: new Date(now.getTime() - DAY) }, "pro", now);
    expect(result?.getTime()).toBe(now.getTime() + 30 * DAY);
  });

  it("keeps an open-ended grant of the same tier open-ended", () => {
    expect(computeNewExpiry({ tier: "elite", tierExpiresAt: null }, "elite", now)).toBeNull();
  });

  it("starts from now when upgrading from pro to elite", () => {
    const result = computeNewExpiry({ tier: "pro", tierExpiresAt: new Date(now.getTime() + 10 * DAY) }, "elite", now);
    expect(result?.getTime()).toBe(now.getTime() + 30 * DAY);
  });
});

describe("canPurchase", () => {
  it("allows buying or renewing when nothing higher is active", () => {
    expect(canPurchase({ tier: "free", tierExpiresAt: null }, "pro", now)).toEqual({ ok: true });
    expect(canPurchase({ tier: "pro", tierExpiresAt: new Date(now.getTime() + DAY) }, "elite", now)).toEqual({ ok: true });
  });

  it("refuses a lower plan while a higher one is active", () => {
    expect(canPurchase({ tier: "elite", tierExpiresAt: new Date(now.getTime() + DAY) }, "pro", now)).toEqual({
      ok: false,
      reason: "higher_plan_active"
    });
  });

  it("allows a lower plan once the higher one expired", () => {
    expect(canPurchase({ tier: "elite", tierExpiresAt: new Date(now.getTime() - DAY) }, "pro", now)).toEqual({ ok: true });
  });
});

describe("isRefundEligible", () => {
  const approvedAt = new Date(now.getTime() - 3 * DAY);

  it("allows a refund of a first purchase within 7 days of approval", () => {
    expect(isRefundEligible({ status: "approved", reviewedAt: approvedAt, isFirstPurchase: true }, now)).toBe(true);
  });

  it("refuses after the 7-day window", () => {
    const old = new Date(now.getTime() - 8 * DAY);
    expect(isRefundEligible({ status: "approved", reviewedAt: old, isFirstPurchase: true }, now)).toBe(false);
  });

  it("refuses when the payment was not the user's first purchase at approval time", () => {
    expect(isRefundEligible({ status: "approved", reviewedAt: approvedAt, isFirstPurchase: false }, now)).toBe(false);
  });

  it("refuses payments that were never approved", () => {
    expect(isRefundEligible({ status: "pending", reviewedAt: null, isFirstPurchase: true }, now)).toBe(false);
  });
});

describe("tierAfterRefund", () => {
  it("removes only the refunded period and keeps later paid days", () => {
    const owner = { tier: "pro", tierExpiresAt: new Date(now.getTime() + 57 * DAY) };
    expect(tierAfterRefund(owner, { tier: "pro", periodDays: 30 }, now)).toEqual({
      tier: "pro",
      tierExpiresAt: new Date(now.getTime() + 27 * DAY)
    });
  });

  it("returns to free when nothing paid is left", () => {
    const owner = { tier: "pro", tierExpiresAt: new Date(now.getTime() + 27 * DAY) };
    expect(tierAfterRefund(owner, { tier: "pro", periodDays: 30 }, now)).toEqual({ tier: "free", tierExpiresAt: null });
  });

  it("leaves a different active tier or an open-ended grant untouched", () => {
    const elite = { tier: "elite", tierExpiresAt: new Date(now.getTime() + 20 * DAY) };
    expect(tierAfterRefund(elite, { tier: "pro", periodDays: 30 }, now)).toBeNull();
    expect(tierAfterRefund({ tier: "pro", tierExpiresAt: null }, { tier: "pro", periodDays: 30 }, now)).toBeNull();
  });
});

describe("getCardDetails", () => {
  it("returns null until the owner configures a card", () => {
    expect(getCardDetails({})).toBeNull();
    expect(getCardDetails({ BILLING_CARD_NUMBER: "0000-0000-0000-0000" })).toBeNull();
  });

  it("returns the card number digits and holder when configured", () => {
    expect(
      getCardDetails({ BILLING_CARD_NUMBER: "0000-0000-0000-0000", BILLING_CARD_HOLDER: "Sample Holder", BILLING_BANK_NAME: "Melli" })
    ).toEqual({ cardNumber: "0000000000000000", holder: "Sample Holder", bank: "Melli" });
  });

  it("rejects a card number that is not 16 digits", () => {
    expect(getCardDetails({ BILLING_CARD_NUMBER: "1234", BILLING_CARD_HOLDER: "Sample Holder" })).toBeNull();
  });
});

describe("USDT payments", () => {
  const WALLET = "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE";

  it("prices each plan in USDT as well", () => {
    expect(PAID_PLANS.pro.priceUsdt).toBeGreaterThan(0);
    expect(PAID_PLANS.elite.priceUsdt).toBeGreaterThan(PAID_PLANS.pro.priceUsdt);
  });

  it("quotes the amount and currency for each method", () => {
    expect(quote("pro", "card_to_card")).toEqual({ amount: PAID_PLANS.pro.priceToman, currency: "toman" });
    expect(quote("elite", "usdt_trc20")).toEqual({ amount: PAID_PLANS.elite.priceUsdt, currency: "usdt" });
  });

  it("returns the TRC20 wallet only when it is a valid Tron address", () => {
    expect(getUsdtWallet({})).toBeNull();
    expect(getUsdtWallet({ BILLING_USDT_TRC20_ADDRESS: "0x1234" })).toBeNull();
    expect(getUsdtWallet({ BILLING_USDT_TRC20_ADDRESS: ` ${WALLET} ` })).toEqual({ address: WALLET, network: "TRC20" });
  });

  it("validates the tracking code format per method", () => {
    expect(isValidTrackingCode("card_to_card", "123456789012")).toBe(true);
    expect(isValidTrackingCode("card_to_card", "12ab")).toBe(false);
    expect(isValidTrackingCode("card_to_card", "123456")).toBe(false);
    expect(isValidTrackingCode("usdt_trc20", "a".repeat(64))).toBe(true);
    expect(isValidTrackingCode("usdt_trc20", "123456789012")).toBe(false);
  });
});

describe("normalizeTrackingCode", () => {
  it("converts Persian and Arabic-Indic digits and strips spaces", () => {
    expect(normalizeTrackingCode("card_to_card", " ۱۲۳۴ ۵۶۷۸ ٩٠١٢ ")).toBe("123456789012");
  });

  it("lower-cases transaction hashes so one transfer cannot be claimed twice", () => {
    expect(normalizeTrackingCode("usdt_trc20", "AB".repeat(32))).toBe("ab".repeat(32));
  });
});

describe("reserveUsdtAmount", () => {
  it("adds the smallest free cent step so each open purchase has its own amount", () => {
    expect(reserveUsdtAmount("pro", [])).toBe(PAID_PLANS.pro.priceUsdt + 0.01);
    expect(reserveUsdtAmount("pro", [5.01, 5.02])).toBe(5.03);
    expect(reserveUsdtAmount("pro", [5.02])).toBe(5.01);
  });

  it("uses at most two decimals so exchanges that round can still send it", () => {
    const amount = reserveUsdtAmount("elite", [12.01, 12.02, 12.03]);
    expect(amount).toBe(12.04);
    expect(Number(amount!.toFixed(2))).toBe(amount);
  });

  it("returns null when every step is taken", () => {
    const taken = Array.from({ length: 49 }, (_, k) => Number((5 + (k + 1) / 100).toFixed(2)));
    expect(reserveUsdtAmount("pro", taken)).toBeNull();
  });

  it("keeps a reservation for two days", () => {
    expect(USDT_INTENT_TTL_HOURS).toBe(48);
  });
});
