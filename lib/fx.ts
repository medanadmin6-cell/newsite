import { getCountry } from "./countries";

/**
 * Ghana deposits are collected in cedis and credited in dollars.
 *
 * The fallback is the Bank of Ghana interbank mid rate for 26 Oct 2026
 * (USDGHS 11.6500). GHS_PER_USD overrides it when the rate moves.
 */

export const WALLET_CURRENCY = "USD";
export const MIN_WALLET_DEPOSIT = 25;
/** One high total. The bonus is claimed when deposited money fills this, not after a count of deposits. */
export const HIGH_DEPOSIT_USD = 100;

const FALLBACK_GHS_PER_USD = 11.65;

export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function ghsPerUsd(): number {
  const raw = process.env.GHS_PER_USD || process.env.NEXT_PUBLIC_GHS_PER_USD;
  const n = Number(raw);
  if (raw && raw.trim() !== "" && Number.isFinite(n) && n > 0) return n;
  return FALLBACK_GHS_PER_USD;
}

export function ghsToUsd(ghs: number, rate = ghsPerUsd()): number {
  return roundMoney(ghs / rate);
}

export function usdToGhs(usd: number, rate = ghsPerUsd()): number {
  return roundMoney(usd * rate);
}

/** Ghana mobile money is collected in cedis. The wallet itself is stored in dollars. */
export function depositsInCedis(countryCode: string | null | undefined): boolean {
  return String(countryCode ?? "").toUpperCase() === "GH";
}

/** A Ghana dollar-wallet should be shown to the player in cedis. */
export function walletShowsCedis(
  countryCode: string | null | undefined,
  currency: string | null | undefined,
): boolean {
  return depositsInCedis(countryCode) && String(currency ?? "USD").toUpperCase() === "USD";
}

/** Player-facing amount. Ghana dollar balances become cedis; every other wallet is unchanged. */
export function toDisplayAmount(
  countryCode: string | null | undefined,
  currency: string | null | undefined,
  amount: number,
): { currency: string; amount: number } {
  if (walletShowsCedis(countryCode, currency)) {
    return { currency: "GHS", amount: usdToGhs(amount) };
  }
  if (depositsInCedis(countryCode)) return { currency: "GHS", amount };
  return { currency: currency || "USD", amount };
}

/** The wallet amount for a figure the player typed in cedis. */
export function toWalletAmount(
  countryCode: string | null | undefined,
  currency: string | null | undefined,
  amount: number,
): number {
  if (walletShowsCedis(countryCode, currency)) return ghsToUsd(amount);
  return amount;
}

/**
 * The currency a stake is typed and stored in.
 * Ghana stakes stay in cedis. Deposits are the only figures kept in dollars.
 */
export function stakeCurrencyFor(
  countryCode: string | null | undefined,
  walletCurrency: string | null | undefined,
): string {
  if (walletShowsCedis(countryCode, walletCurrency)) return "GHS";
  return String(walletCurrency || "USD").toUpperCase();
}

/** What a stake-currency figure is worth in the wallet. Cedis become dollars; every other stake is already wallet money. */
export function stakeToWallet(
  stakeCurrency: string,
  walletCurrency: string | null | undefined,
  amount: number,
): number {
  const wallet = String(walletCurrency || "USD").toUpperCase();
  if (String(stakeCurrency).toUpperCase() === "GHS" && wallet === "USD") {
    return ghsToUsd(amount);
  }
  return roundMoney(amount);
}

/**
 * How much has to land in the wallet before the bonus is claimed.
 * Dollar wallets share one target. Other markets use one high total instead of
 * a count of separate deposits.
 */
export function highDepositTarget(countryCode: string, currency: string): number {
  if (String(currency).toUpperCase() === "USD") return HIGH_DEPOSIT_USD;
  const country = getCountry(countryCode);
  const times = country.withdrawQualifyCount > 0 ? country.withdrawQualifyCount : 1;
  return country.withdrawQualifyAmount * times;
}

export function ghanaToUsdPatch(user: {
  country_code: string;
  currency: string;
  balance: number | string;
  total_deposited: number | string;
  total_withdrawn: number | string;
}): { currency: "USD"; balance: number; total_deposited: number; total_withdrawn: number } | null {
  if (!depositsInCedis(user.country_code)) return null;
  if (String(user.currency).toUpperCase() !== "GHS") return null;
  const rate = ghsPerUsd();
  return {
    currency: "USD",
    balance: ghsToUsd(Number(user.balance), rate),
    total_deposited: ghsToUsd(Number(user.total_deposited), rate),
    total_withdrawn: ghsToUsd(Number(user.total_withdrawn), rate),
  };
}

/**
 * What a settled cedi charge is worth in the dollar wallet.
 * A short payment scales the quoted dollars. A full payment keeps the quote,
 * so $25.00 does not become $24.99 from rounding.
 */
export function walletCreditFromCharge(
  charge: number,
  chargeCurrency: string,
  meta?: { walletAmount?: number; quotedGhs?: number; fxRate?: number } | null,
): { amount: number; currency: string } {
  if (String(chargeCurrency).toUpperCase() !== "GHS") {
    return { amount: roundMoney(charge), currency: String(chargeCurrency).toUpperCase() };
  }
  const rate = Number(meta?.fxRate) > 0 ? Number(meta?.fxRate) : ghsPerUsd();
  const quotedUsd = Number(meta?.walletAmount);
  const quotedGhs = Number(meta?.quotedGhs);
  if (quotedUsd > 0 && quotedGhs > 0) {
    return { amount: roundMoney(quotedUsd * (charge / quotedGhs)), currency: WALLET_CURRENCY };
  }
  return { amount: ghsToUsd(charge, rate), currency: WALLET_CURRENCY };
}
