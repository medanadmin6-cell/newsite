import { getCountry } from "./countries";
import { highDepositTarget } from "./fx";

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
  const unit = user.currency || country.currency;
  const target = highDepositTarget(user.country_code, unit);
  const deposited = Math.max(0, Number(user.total_deposited) || 0);
  const progress = {
    have: deposited,
    need: target,
    amount: target,
    label: deposited >= target ? "Bonus claimed" : "Deposit a high amount to claim your bonus",
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
  // One high total. The bar fills with deposited money. A count of separate
  // deposits is not part of the rule. Admin and approved sub-admin accounts
  // skip this gate.
  if (!options.skipDepositGate && deposited < target) {
    return {
      ok: false,
      failed: "deposits",
      message: "Deposit a high amount to claim your bonus.",
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
  const target = highDepositTarget(user.country_code, user.currency);
  return target > 0 && Number(user.total_deposited) >= target;
}
