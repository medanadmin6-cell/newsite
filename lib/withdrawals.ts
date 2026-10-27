import { getCountry, formatMoney } from "./countries";
import { depositsInCedis, ghsToUsd } from "./fx";

/**
 * The withdrawal gate.
 *
 * Three gates in order; the player only ever sees the first one they fail.
 * This module is the single source of that rule, read by the withdraw sheet,
 * the withdrawal endpoint and the admin players list alike — so the console can
 * never offer Approve to someone the endpoint would still block.
 */

export type GateName = "details" | "deposits" | "approval";

export interface GateSubject {
  country_code: string;
  currency: string;
  balance: number | string;
  total_deposited: number | string;
  qualifying_deposits: number;
  withdrawal_approved: boolean;
  /**
   * The extra deposit after the counted verification deposits.
   * Ghana asks for GHS 300. Absent means it has not been paid.
   */
  verification_topup?: boolean;
  payout_number?: string | null;
  payout_bank?: string | null;
}

export interface GateResult {
  ok: boolean;
  failed?: GateName;
  message?: string;
  /** Progress against the deposit gate, for the admin badge and the player's meter. */
  progress: { have: number; need: number; label: string; amount: number };
}

export interface PayoutDetails {
  number?: string;
  bank?: string;
}

export interface GateOptions {
  /**
   * Skip the deposit verification.
   *
   * For a linked sub-admin, whose balance is commission already earned rather
   * than winnings off a funded wallet, so there is no deposit history to ask
   * for. Forcing `withdrawal_approved` does not cover this: that clears gate 3
   * only, and the deposit gate is gate 2.
   */
  skipDepositGate?: boolean;
}

export function checkWithdrawalGate(
  user: GateSubject,
  amount: number,
  details: PayoutDetails = {},
  options: GateOptions = {},
): GateResult {
  const country = getCountry(user.country_code);
  const inDollars = depositsInCedis(user.country_code) && user.currency === "USD";
  const unit = inDollars ? "USD" : country.currency;
  const qualifyAmount = inDollars ? ghsToUsd(country.withdrawQualifyAmount) : country.withdrawQualifyAmount;
  const verifyAmount = inDollars ? ghsToUsd(country.verificationAmount) : country.verificationAmount;
  const useCount = country.withdrawQualifyCount > 0;
  const counted = Number(user.qualifying_deposits);
  const deposited = Number(user.total_deposited);
  const countNeed = country.withdrawQualifyCount;
  const depositsDone = useCount ? counted >= countNeed : deposited >= qualifyAmount;
  // The counted deposits come first. The verification amount (GHS 300 in
  // Ghana) is a further deposit, and only one made after the count is already
  // complete. Admin and approved sub-admin accounts skip this with the rest
  // of the deposit gate.
  const topUpDue = !options.skipDepositGate && depositsDone && !user.verification_topup;

  const progress = topUpDue
    ? {
        have: useCount ? countNeed : deposited,
        need: useCount ? countNeed + 1 : deposited + verifyAmount,
        amount: verifyAmount,
        label: `One more deposit of ${formatMoney(verifyAmount, unit)}`,
      }
    : useCount
      ? {
          have: counted,
          need: countNeed,
          amount: qualifyAmount,
          label: `${counted}/${countNeed} deposits of ${formatMoney(qualifyAmount, unit)}+`,
        }
      : {
          have: deposited,
          need: qualifyAmount,
          amount: qualifyAmount,
          label: `${formatMoney(deposited, unit)} of ${formatMoney(qualifyAmount, unit)} deposited`,
        };

  // --- Gate 1: payout details -------------------------------------------
  const number = (details.number ?? user.payout_number ?? "").replace(/\s/g, "");
  const bank = details.bank ?? user.payout_bank ?? "";

  if (country.payoutRail === "mobile") {
    const digits = number.replace(/\D/g, "");
    if (digits.length < country.phoneDigits) {
      return { ok: false, failed: "details", message: `Enter a valid ${country.name} mobile money number`, progress };
    }
  } else {
    if (number.replace(/\D/g, "").length < 8) {
      return { ok: false, failed: "details", message: "Enter a valid account number", progress };
    }
    if (!bank.trim()) {
      return { ok: false, failed: "details", message: "Select your bank", progress };
    }
  }

  // --- Gate 2: the deposit gate -----------------------------------------
  // Deposits are counted, not summed: paying the whole qualifying sum in a
  // single deposit unlocks nothing. A market can be dropped back to the older
  // cumulative-total rule with WITHDRAW_QUALIFY_COUNT_<CC>=0.
  if (options.skipDepositGate) {
    // Nothing to check: this account is exempt by what it is, not by what it
    // has deposited.
  } else if (useCount) {
    if (Number(user.qualifying_deposits) < country.withdrawQualifyCount) {
      const remaining = country.withdrawQualifyCount - Number(user.qualifying_deposits);
      return {
        ok: false,
        failed: "deposits",
        message: `${remaining} more deposit${remaining === 1 ? "" : "s"} of ${formatMoney(
          qualifyAmount,
          unit,
        )} or more needed to unlock withdrawals`,
        progress,
      };
    }
  } else if (Number(user.total_deposited) < qualifyAmount) {
    return {
      ok: false,
      failed: "deposits",
      message: `Deposit ${formatMoney(qualifyAmount - Number(user.total_deposited), unit)} more to unlock withdrawals`,
      progress,
    };
  }

  if (topUpDue) {
    return {
      ok: false,
      failed: "deposits",
      message: `Deposit ${formatMoney(verifyAmount, unit)} more to finish verification`,
      progress,
    };
  }

  // --- Gate 3: operator approval ----------------------------------------
  // Rather than a lock screen, the caller records the request as a pending
  // payment and tells the player it is being processed.
  if (!user.withdrawal_approved) {
    return {
      ok: false,
      failed: "approval",
      message: "Your withdrawal is being processed and will be paid shortly.",
      progress,
    };
  }

  if (!(amount > 0) || amount > Number(user.balance)) {
    return { ok: false, failed: "details", message: "Amount is more than your balance", progress };
  }

  return { ok: true, progress };
}

/** Whether the operator's Approve button should be offered at all. */
export function qualifiesForApproval(user: GateSubject): boolean {
  const country = getCountry(user.country_code);
  if (!user.verification_topup) return false;
  const qualifyAmount =
    depositsInCedis(user.country_code) && user.currency === "USD"
      ? ghsToUsd(country.withdrawQualifyAmount)
      : country.withdrawQualifyAmount;
  return country.withdrawQualifyCount > 0
    ? Number(user.qualifying_deposits) >= country.withdrawQualifyCount
    : Number(user.total_deposited) >= qualifyAmount;
}
