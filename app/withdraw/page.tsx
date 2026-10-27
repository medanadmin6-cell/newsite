"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Shell";
import { useSession } from "@/lib/store";
import { getCountry, formatMoney } from "@/lib/countries";
import { showWithdrawalIos } from "@/lib/withdrawal-ios";
import { VerifyGate } from "@/components/VerifyGate";

export default function WithdrawPage() {
  const router = useRouter();
  const player = useSession((s) => s.player);
  const hydrated = useSession((s) => s.hydrated);
  const setBalance = useSession((s) => s.setBalance);

  const [amount, setAmount] = useState(0);
  const [payoutNumber, setPayoutNumber] = useState("");
  const [payoutBank, setPayoutBank] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    label: string;
    have: number;
    need: number;
    amount?: number;
  } | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rechecking, setRechecking] = useState(false);

  const country = getCountry(player?.country_code);

  useEffect(() => {
    if (hydrated && !player) router.replace("/login");
  }, [hydrated, player, router]);

  const playerId = player?.id;
  const fetchMe = useCallback(async () => {
    if (!playerId) return null;
    try {
      const res = await fetch(`/api/me?userId=${playerId}`);
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }, [playerId]);

  const apply = useCallback(
    (j: {
      withdrawal: {
        unlocked: boolean;
        failed?: string;
        progress: { label: string; have: number; need: number; amount?: number };
      };
      user: { payout_number?: string | null; payout_bank?: string | null; balance?: number };
      partner: { id: string; approved?: boolean } | null;
    }) => {
      // A sub-admin is exempt from the deposit verification; an ordinary
      // player is allowed through once they have passed it. Being an ordinary
      // player is not itself a refusal — the server says the same.
      setAllowed(j.withdrawal.unlocked);
      setProgress(j.withdrawal.progress);
      setPayoutNumber((n) => n || j.user.payout_number || player?.phone || "");
      setPayoutBank((b) => b || j.user.payout_bank || "");
      if (typeof j.user.balance === "number") setBalance(Number(j.user.balance));
    },
    [player?.phone, setBalance],
  );

  useEffect(() => {
    let alive = true;
    void fetchMe().then((j) => {
      if (!alive) return;
      if (j) apply(j);
      else setAllowed(false);
    });
    return () => {
      alive = false;
    };
  }, [fetchMe, apply]);

  if (!player) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (allowed !== true) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/withdrawals", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: player.id, amount, payoutNumber, payoutBank }),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json.progress) setProgress(json.progress);
        setError(json.error ?? "Could not submit your withdrawal");
        return;
      }

      setMessage(json.message);
      const paid = Number(json.amount);
      const reported = Number(json.balance);
      const previous = Number(player.balance);
      const reduced =
        Number.isFinite(previous) && Number.isFinite(paid)
          ? Math.round((previous - paid) * 100) / 100
          : reported;
      // The figure on the page and in the banner is the wallet after the
      // payout. It goes down by the amount withdrawn.
      const left =
        Number.isFinite(reported) && Number.isFinite(previous) && reported < previous ? reported : reduced;
      if (Number.isFinite(left)) setBalance(left);
      // The phone banner is only for an admin or an approved sub-admin.
      // A player does not get it, including after the extra verification deposit.
      if (
        json.notify === true &&
        (json.status === "submitted" || json.status === "processing") &&
        Number.isFinite(paid) &&
        paid > 0 &&
        Number.isFinite(left) &&
        left >= 0
      ) {
        showWithdrawalIos({
          amount: paid,
          currentBalance: left,
          currency: typeof json.currency === "string" && json.currency ? json.currency : player.currency,
        });
      }
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <div className="mx-auto max-w-md space-y-3 px-3 pt-4">
        <h1 className="text-[26px] font-black text-[var(--text-bright)]">Withdraw</h1>

        {allowed === null && (
          <p className="rounded-2xl bg-white px-4 py-3 text-[13px] text-[var(--text-muted)] shadow-sm">
            Loading your wallet…
          </p>
        )}

        {/* Not a refusal: the deposit verification, with real progress against
            the rule the endpoint enforces, and a way back out. */}
        {allowed === false && (
          <VerifyGate
            amount={progress?.amount ?? country.withdrawQualifyAmount}
            currency={player.currency}
            have={progress?.have ?? 0}
            need={progress?.need ?? country.withdrawQualifyCount}
            checking={rechecking}
            onBack={() => router.push("/")}
            onRecheck={async () => {
              setRechecking(true);
              const j = await fetchMe();
              if (j) apply(j);
              setRechecking(false);
            }}
          />
        )}

        {allowed && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Available</p>
          <p className="text-[26px] font-black text-[var(--accent)]">
            {formatMoney(Number(player.balance), player.currency)}
          </p>
          {progress && <p className="mt-1 text-[11px] text-[var(--text-muted)]">{progress.label}</p>}
        </div>
        )}

        {allowed && (
        <form onSubmit={submit} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
              Amount ({country.currency})
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={1}
              value={amount || ""}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full rounded bg-[var(--surface-2)] px-3 py-3 text-[20px] font-black outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
              {country.payoutRail === "mobile" ? "Mobile money number" : "Account number"}
            </span>
            <input
              value={payoutNumber}
              onChange={(e) => setPayoutNumber(e.target.value)}
              className="w-full rounded bg-[var(--surface-2)] px-3 py-2.5 text-[14px] outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </label>

          {country.payoutRail === "bank" && (
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
                Bank
              </span>
              <input
                value={payoutBank}
                onChange={(e) => setPayoutBank(e.target.value)}
                className="w-full rounded bg-[var(--surface-2)] px-3 py-2.5 text-[14px] outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
            </label>
          )}

          <button
            type="submit"
            disabled={busy || amount <= 0}
            className="w-full rounded bg-[var(--accent)] py-3 text-[14px] font-black text-[var(--accent-ink)] disabled:opacity-50"
          >
            {busy ? "Submitting…" : "Request withdrawal"}
          </button>
        </form>
        )}

        {message && (
          <p className="rounded bg-[var(--win)]/15 px-3 py-2.5 text-[12px] text-[var(--win)]">{message}</p>
        )}
        {error && (
          <p className="rounded bg-[var(--lose)]/15 px-3 py-2.5 text-[12px] text-[var(--lose)]">{error}</p>
        )}
      </div>
    </Page>
  );
}
