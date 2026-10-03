/**
 * Paid plans sold by manual-review transfer: card-to-card in Toman or USDT on TRC20. Prices are the
 * owner's business decision: change them here. The destination card and wallet come only from env so
 * they never land in git; until one is configured, that method is shown as not open yet.
 */
export type PaidTier = "pro" | "elite";
export type PaymentMethod = "card_to_card" | "usdt_trc20";
export type PaymentCurrency = "toman" | "usdt";

export const PAID_PLANS: Record<PaidTier, { priceToman: number; priceUsdt: number; periodDays: number }> = {
  pro: { priceToman: 200_000, priceUsdt: 5, periodDays: 30 },
  elite: { priceToman: 500_000, priceUsdt: 12, periodDays: 30 }
};

/** Money-back window for a user's first approved payment (see the Terms of Use). */
export const REFUND_WINDOW_DAYS = 7;

/** How long a reserved USDT amount stays valid for one purchase. */
export const USDT_INTENT_TTL_HOURS = 48;

const MAX_CENT_STEPS = 49;

/**
 * TRC20 transfers are public and exchange hot wallets do not identify the sender, so each open USDT
 * purchase gets its own amount (price + 0.01 .. 0.49) reserved before the transfer. The admin approves
 * only a transfer of exactly that amount. Two decimals, because some exchanges round withdrawals.
 * Returns null when every step is taken by other open purchases.
 */
export function reserveUsdtAmount(tier: PaidTier, takenAmounts: number[]): number | null {
  const taken = new Set(takenAmounts.map((amount) => Math.round(amount * 100)));
  const base = Math.round(PAID_PLANS[tier].priceUsdt * 100);
  for (let step = 1; step <= MAX_CENT_STEPS; step++) {
    if (!taken.has(base + step)) return (base + step) / 100;
  }
  return null;
}

/** The list price for a plan with a given method (a USDT purchase then reserves its exact amount). */
export function quote(tier: PaidTier, method: PaymentMethod): { amount: number; currency: PaymentCurrency } {
  return method === "usdt_trc20"
    ? { amount: PAID_PLANS[tier].priceUsdt, currency: "usdt" }
    : { amount: PAID_PLANS[tier].priceToman, currency: "toman" };
}

const PERSIAN_ZERO = 0x06f0;
const ARABIC_INDIC_ZERO = 0x0660;

/** ASCII digits, no whitespace; transaction hashes lower-cased so casing cannot dodge the unique index. */
export function normalizeTrackingCode(method: PaymentMethod, code: string): string {
  const ascii = code
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - PERSIAN_ZERO))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - ARABIC_INDIC_ZERO))
    .replace(/\s+/g, "");
  return method === "usdt_trc20" ? ascii.toLowerCase() : ascii;
}

/**
 * Card transfers need the 12+ digit bank reference number (RRN), not the short 6-digit tracking
 * number, which collides between users. TRC20 transaction hashes are 64 hex characters.
 */
export function isValidTrackingCode(method: PaymentMethod, code: string): boolean {
  return method === "usdt_trc20" ? /^[0-9a-fA-F]{64}$/.test(code) : /^\d{12,20}$/.test(code);
}

export type BillingEnv = {
  BILLING_CARD_NUMBER?: string;
  BILLING_CARD_HOLDER?: string;
  BILLING_BANK_NAME?: string;
  BILLING_USDT_TRC20_ADDRESS?: string;
};

export type CardDetails = { cardNumber: string; holder: string; bank?: string };

/** The card-to-card destination, or null while it is missing or not a 16-digit card number. */
export function getCardDetails(env: BillingEnv): CardDetails | null {
  const digits = (env.BILLING_CARD_NUMBER ?? "").replace(/\D/g, "");
  const holder = env.BILLING_CARD_HOLDER?.trim();
  if (digits.length !== 16 || !holder) return null;
  const bank = env.BILLING_BANK_NAME?.trim();
  return bank ? { cardNumber: digits, holder, bank } : { cardNumber: digits, holder };
}

export type UsdtWallet = { address: string; network: "TRC20" };

// Tron base58 addresses: "T" + 33 base58 characters.
const TRON_ADDRESS = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

/** The USDT (TRC20) destination, or null while it is missing or not a Tron address. */
export function getUsdtWallet(env: BillingEnv): UsdtWallet | null {
  const address = env.BILLING_USDT_TRC20_ADDRESS?.trim() ?? "";
  return TRON_ADDRESS.test(address) ? { address, network: "TRC20" } : null;
}
