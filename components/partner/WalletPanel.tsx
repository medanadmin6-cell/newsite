"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet, ArrowRight, Banknote } from "lucide-react";
import { useSession } from "@/lib/store";
import { allCountries, getCountry, formatMoney } from "@/lib/countries";

/**
 * The partner's own betting account.
 *
 * A partner has two identities that live side by side: the dashboard cookie and
 * a player session in browser storage. Opening the wallet signs them into the
 * player session without clearing the dashboard cookie, which is what lets them
 * bet and come straight back here.
 */

export interface WalletAccount {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  country_code: string;
  currency: string;
  balance: number;
}

export function WalletPanel({
  wallet,
  approved,
  defaultPhone,
  creditedToday,
  dailyLimit,
  onChanged,
}: {
  wallet: WalletAccount | null;
  approved: boolean;
  defaultPhone: string | null;
  creditedToday: number;
  dailyLimit: number;
  onChanged: () => void;
}) {
  const router = useRouter();
  const signIn = useSession((s) => s.signIn);

  const [countryCode, setCountryCode] = useState("GH");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const country = getCountry(wallet?.country_code ?? countryCode);

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/partner/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryCode, phone }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not open the account");
        return;
      }
      signIn(json.player);
      setNote("Betting account opened.");
      onChanged();
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const credit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/partner/credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount) }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not credit the wallet");
        return;
      }
      setNote(`Credited. New balance ${formatMoney(json.balance, country.currency)}.`);
      setAmount("");
      onChanged();
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  /** Sign into the betting account, then open a page on the main site. */
  const enterSite = (path: string) => {
    if (!wallet) return;
    signIn({
      id: wallet.id,
      name: wallet.name,
      phone: wallet.phone,
      email: wallet.email,
      country_code: wallet.country_code,
      currency: wallet.currency,
      balance: Number(wallet.balance),
    });
    router.push(path);
  };

  // --- Not opened yet ------------------------------------------------------
  if (!wallet) {
    return (
      <section className="overflow-hidden rounded bg-[var(--bg-elevated)]">
        <h2 className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-2.5 text-[13px] font-bold">
          <Wallet size={15} strokeWidth={1.9} className="text-[var(--accent)]" />
          Your betting account
        </h2>

        <div className="space-y-3 p-4">
          <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
            Open a betting account on your own partner login. Same password, and you can move between
            here and the main site whenever you like. Withdraw is on that account.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
                Country
              </span>
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="w-full rounded bg-[var(--surface-2)] px-3 py-2 text-[13px] outline-none focus:ring-1 focus:ring-[var(--accent)]"
              >
                {allCountries().map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} · {c.currency}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
                Phone number
              </span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={`0${"X".repeat(getCountry(countryCode).phoneDigits)}`}
                className="w-full rounded bg-[var(--surface-2)] px-3 py-2 text-[13px] outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
            </label>
          </div>

          {error && <p className="text-[12px] text-[var(--lose)]">{error}</p>}

          <button
            onClick={open}
            disabled={busy || !phone.trim()}
            className="rounded bg-[var(--accent)] px-4 py-2.5 text-[13px] font-black text-[var(--accent-ink)] disabled:opacity-50"
          >
            {busy ? "Opening…" : "Open betting account"}
          </button>
        </div>
      </section>
    );
  }

  // --- Opened --------------------------------------------------------------
  const remaining = Math.max(0, dailyLimit - creditedToday);

  return (
    <section className="overflow-hidden rounded bg-[var(--bg-elevated)]">
      <h2 className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-2.5 text-[13px] font-bold">
        <Wallet size={15} strokeWidth={1.9} className="text-[var(--accent)]" />
        Your betting account
      </h2>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Wallet balance</p>
            <p className="text-[26px] font-black leading-none text-[var(--accent)]">
              {formatMoney(Number(wallet.balance), wallet.currency)}
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-faint)]">
              {wallet.phone} · {country.name}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => enterSite("/withdraw")}
              className="flex items-center gap-1.5 rounded bg-[var(--accent)] px-4 py-2.5 text-[13px] font-black text-[var(--accent-ink)]"
            >
              <Banknote size={15} strokeWidth={2.2} />
              Withdraw
            </button>
            <button
              onClick={() => enterSite("/")}
              className="flex items-center gap-1.5 rounded px-4 py-2.5 text-[13px] font-black text-[var(--text-bright)] ring-1 ring-[var(--line)]"
            >
              Go to the board
              <ArrowRight size={15} strokeWidth={2.4} />
            </button>
          </div>
        </div>

        <form onSubmit={credit} className="space-y-2 rounded bg-[var(--surface)] p-3">
          <p className="text-[12px] font-semibold">Credit your wallet</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Amount in ${wallet.currency}`}
              className="w-40 rounded bg-[var(--surface-2)] px-3 py-2 text-[13px] outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
            <button
              type="submit"
              disabled={busy || !approved || !amount}
              className="rounded bg-[var(--accent-dim)] px-4 py-2 text-[13px] font-black text-[var(--accent-ink)] disabled:opacity-40"
            >
              {busy ? "Working…" : "Credit"}
            </button>
          </div>

          <div className="h-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div
              className="h-full rounded-full bg-[var(--accent)]"
              style={{ width: `${Math.min(100, (creditedToday / Math.max(1, dailyLimit)) * 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-[var(--text-faint)]">
            {formatMoney(creditedToday, wallet.currency)} of {formatMoney(dailyLimit, wallet.currency)}{" "}
            used today · {formatMoney(remaining, wallet.currency)} left. Every credit is recorded on the
            operator&apos;s ledger.
          </p>

          {!approved && (
            <p className="text-[11px] text-[var(--pending)]">
              Crediting unlocks once the operator approves your partner account.
            </p>
          )}
        </form>

        {note && <p className="text-[12px] text-[var(--win)]">{note}</p>}
        {error && <p className="text-[12px] text-[var(--lose)]">{error}</p>}

        <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">
          This wallet is separate from your commission. Commission stays on the partner side and is
          settled by the operator.
        </p>
      </div>
    </section>
  );
}
