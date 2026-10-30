"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Shown when a withdrawal is opened before the high deposit total is filled.
 *
 * The bar is deposited money against that total, the same figures the endpoint
 * enforces. A deposit lands in the player's own betting wallet.
 */
export function VerifyGate({
  have,
  need,
  onBack,
  onRecheck,
  checking = false,
}: {
  have: number;
  need: number;
  onBack: () => void;
  onRecheck: () => void;
  checking?: boolean;
}) {
  const done = Math.max(0, Math.min(have, need));
  const pct = need > 0 ? Math.min(100, Math.round((done / need) * 100)) : 0;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-6"
      role="dialog"
      aria-modal="true"
      aria-label="Verification required"
    >
      <div className="absolute inset-0 bg-black/85" />

      <div className="relative w-full max-w-sm rounded-[10px] bg-[var(--bg-elevated)] p-5">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            aria-label="Back"
            className="-ml-1 flex h-8 w-8 items-center justify-center text-[var(--text-muted)]"
          >
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
          <p className="text-[13px] font-bold text-[var(--text-faint)]">Your bonus</p>
        </div>

        <p className="mt-3 text-[17px] leading-relaxed text-[var(--text-bright)]">
          Deposit a high amount to claim your bonus. The bar fills as you deposit.
        </p>

        <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        <Link
          href="/deposit"
          className="mt-5 block rounded-[6px] bg-[var(--accent)] py-3.5 text-center text-[16px] font-black text-[var(--accent-ink)]"
        >
          Deposit to fill your bonus
        </Link>

        <button
          onClick={onRecheck}
          disabled={checking}
          className="mt-3 w-full text-center text-[14px] font-medium text-[var(--text-muted)]"
        >
          {checking ? "Checking…" : "I've completed a deposit"}
        </button>

        <p className="mt-4 text-[12px] leading-relaxed text-[var(--text-faint)]">
          Deposits go to your own betting wallet. The money stays yours to bet with — it is not a
          fee, and nothing is taken from your balance to release a withdrawal.
        </p>
      </div>
    </div>
  );
}
