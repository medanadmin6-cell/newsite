"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CircleHelp,
  Home,
  Smartphone,
  ChevronRight,
  MapPin,
  Check,
} from "lucide-react";
import { useSession } from "@/lib/store";
import { getCountry, formatMoney, localSignificant } from "@/lib/countries";
import { depositsInCedis, ghsToUsd, highDepositTarget, MIN_WALLET_DEPOSIT, usdToGhs } from "@/lib/fx";

/**
 * The deposit screen.
 *
 * One rail: the country's instant gateway. The limits at the bottom are the
 * same ones the endpoint enforces.
 */
export default function DepositPage() {
  const router = useRouter();
  const player = useSession((s) => s.player);
  const hydrated = useSession((s) => s.hydrated);
  const setBalance = useSession((s) => s.setBalance);
  const setWallet = useSession((s) => s.setWallet);

  const [amount, setAmount] = useState("");
  const [phoneEdit, setPhoneEdit] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [switching, setSwitching] = useState<"phone" | "network" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [done, setDone] = useState<{ balance?: number; bonus?: number } | null>(null);
  const [deposited, setDeposited] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const country = getCountry(player?.country_code);
  const cedis = depositsInCedis(player?.country_code);
  const walletCurrency = cedis ? "USD" : (player?.currency ?? "USD");
  const phone = phoneEdit ?? player?.phone ?? "";
  const chosenNetwork = network ?? country.networks[0];
  const whatsapp = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP;

  const value = Number(amount);
  const firstDeposit = cedis ? MIN_WALLET_DEPOSIT : country.minFirstDeposit;
  const min = cedis ? MIN_WALLET_DEPOSIT : country.minDeposit;
  const max = cedis ? ghsToUsd(country.maxDeposit) : country.maxDeposit;

  useEffect(() => {
    if (hydrated && !player) router.replace("/login");
  }, [hydrated, player, router]);

  useEffect(() => {
    if (!player?.id) return;
    fetch(`/api/me?userId=${player.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.user && typeof j.user.currency === "string") {
          setWallet(Number(j.user.balance), j.user.currency);
        }
        if (j?.user && j.user.total_deposited != null) {
          setDeposited(Number(j.user.total_deposited) || 0);
        }
      })
      .catch(() => {});
  }, [player?.id, setWallet]);

  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
    },
    [],
  );

  if (!player) return null;

  const startGateway = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/deposits/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: player.id, amount: value, phone, network: chosenNetwork }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not start your deposit");
        return;
      }

      if (json.redirectUrl) {
        window.location.href = json.redirectUrl;
        return;
      }

      setStatus(
        json.awaitingOtp
          ? "Approve the prompt on your phone, then enter the OTP your network sends."
          : "Check your phone and approve the payment prompt.",
      );

      // The rail answers "prompt sent" without knowing whether the handset can
      // receive one, so waiting forever is a real outcome: a wrong or dormant
      // number leaves the player on a spinner with nothing to act on. Give up
      // after two minutes and point them at the number, which is the thing they
      // can actually change.
      const deadline = Date.now() + 120_000;

      pollRef.current = setInterval(async () => {
        try {
          const s = await fetch(`/api/deposits/status?reference=${json.reference}`);
          const sj = await s.json();
          if (sj.status === "confirmed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setStatus(null);
            setDone({ balance: sj.balance, bonus: sj.bonusPaid });
            if (typeof sj.balance === "number") setBalance(sj.balance);
            setDeposited((d) => d + (Number.isFinite(value) ? value : 0));
            setAmount("");
            return;
          }
          if (sj.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setStatus(null);
            setError("That payment did not go through. Check the number below and try again.");
            return;
          }
          if (Date.now() > deadline) {
            if (pollRef.current) clearInterval(pollRef.current);
            setStatus(null);
            setError(
              `No prompt arrived on ${phone}. Check that number is the right mobile money number — tap Change above to use another — then try again. Nothing has been charged.`,
            );
            setSwitching("phone");
          }
        } catch {
          /* keep polling */
        }
      }, 4000);
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <DepositHeader onBack={() => router.push("/")} />
        <div className="mx-auto max-w-md space-y-4 px-6 py-14 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)]">
            <Check size={34} strokeWidth={3} />
          </div>
          <h1 className="text-[20px] font-black">Deposit received</h1>
          {done.bonus ? (
            <p className="text-[13px] text-[var(--accent)]">Your bonus has been added.</p>
          ) : null}
          {typeof done.balance === "number" && (
            <p className="text-[15px] font-bold">
              New balance {formatMoney(done.balance, walletCurrency)}
            </p>
          )}
          <div className="text-left">
            <BonusBar
              deposited={deposited}
              adding={0}
              target={highDepositTarget(player?.country_code ?? "US", walletCurrency)}
            />
          </div>
          <button
            onClick={() => router.push("/")}
            className="w-full rounded bg-[var(--accent)] py-3 text-[14px] font-black text-[var(--accent-ink)]"
          >
            Start betting
          </button>
        </div>
      </div>
    );
  }

  const tooSmall = value > 0 && value < min;
  const tooBig = value > max;
  const canSubmit = value >= min && value <= max && !busy;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <DepositHeader onBack={() => router.back()} />

      <div className="mx-auto max-w-2xl">
            <SwitchRow
              icon={<Smartphone size={20} strokeWidth={1.7} className="text-[var(--text-muted)]" />}
              value={
                <>
                  <span className="text-[var(--text-muted)]">+{country.dialCode}</span>{" "}
                  <span className="text-[var(--text-bright)]">{localSignificant(phone, country.dialCode)}</span>
                </>
              }
              action={switching === "phone" ? "Done" : "Change"}
              muted={switching !== "phone"}
              onAction={() => setSwitching(switching === "phone" ? null : "phone")}
            />

            {switching === "phone" && (
              <div className="px-4 pb-3">
                <input
                  value={phone}
                  onChange={(e) => setPhoneEdit(e.target.value.replace(/[^\d]/g, ""))}
                  inputMode="numeric"
                  placeholder={`0${"X".repeat(country.phoneDigits)}`}
                  className="w-full rounded bg-[var(--surface-2)] px-3 py-2.5 text-[14px] outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />
              </div>
            )}

            <SwitchRow
              icon={
                <span className="flex h-7 w-9 items-center justify-center rounded bg-[var(--pending)] text-[9px] font-black text-[#3F2D03]">
                  {chosenNetwork.split(" ")[0].slice(0, 4).toUpperCase()}
                </span>
              }
              value={<span className="text-[var(--text-bright)]">{chosenNetwork}</span>}
              action="Switch"
              onAction={() => setSwitching(switching === "network" ? null : "network")}
            />

            {switching === "network" && (
              <div className="flex flex-wrap gap-2 px-4 pb-3">
                {country.networks.map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      setNetwork(n);
                      setSwitching(null);
                    }}
                    className="rounded px-3 py-2 text-[13px] font-medium"
                    style={
                      chosenNetwork === n
                        ? { background: "var(--accent)", color: "var(--accent-ink)" }
                        : { background: "var(--surface-2)", color: "var(--text)" }
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}

            <p className="flex items-center justify-end gap-1 px-4 py-3 text-[13px] text-[var(--text-muted)]">
              <MapPin size={13} strokeWidth={2} />
              Balance ({walletCurrency}) {Number(player.balance).toFixed(2)}
            </p>

            <BonusBar
              deposited={deposited}
              adding={Number.isFinite(value) && value > 0 ? value : 0}
              target={highDepositTarget(player.country_code, walletCurrency)}
            />

            <AmountField
              currency={walletCurrency}
              value={amount}
              onChange={setAmount}
              hint={`min. ${min.toFixed(2)}`}
            />
            {cedis && value > 0 && (
              <p className="px-4 pt-2 text-[12px] text-[var(--text-muted)]">
                Mobile money charges {formatMoney(usdToGhs(value), "GHS")}. Your account receives{" "}
                {formatMoney(value, "USD")}.
              </p>
            )}

            <div className="px-4 pt-5">
              <button
                onClick={startGateway}
                disabled={!canSubmit}
                className="w-full rounded-[4px] py-3.5 text-[16px] font-bold transition-colors"
                style={
                  canSubmit
                    ? { background: "var(--accent)", color: "var(--accent-ink)" }
                    : { background: "var(--surface)", color: "var(--text-muted)" }
                }
              >
                {busy ? "Starting…" : "Top Up Now"}
              </button>
            </div>

        {/* Feedback */}
        <div className="space-y-2 px-4 pt-3">
          {tooSmall && (
            <p className="text-[12px] text-[var(--lose)]">
              The minimum deposit is {formatMoney(min, walletCurrency)}.
            </p>
          )}
          {tooBig && (
            <p className="text-[12px] text-[var(--lose)]">
              The most you can send in one transaction is {formatMoney(max, walletCurrency)}.
            </p>
          )}
          {status && (
            <p className="rounded bg-[var(--pending)]/15 px-3 py-2.5 text-[12px] text-[var(--pending)]">
              {status}
            </p>
          )}
          {error && (
            <p className="rounded bg-[var(--lose-bg)] px-3 py-2.5 text-[12px] text-[var(--lose)]">{error}</p>
          )}
        </div>

        {/* The rules, read from the same config the endpoint enforces. */}
        <ol className="mt-6 space-y-2 px-4 text-[13px] leading-relaxed text-[var(--text-muted)]">
          <li>
            1. The maximum amount per transaction is{" "}
            <strong className="text-[var(--accent)]">{formatMoney(max, walletCurrency)}</strong>. To
            deposit more than that, make multiple payments.
          </li>
          <li>
            2. The minimum you can deposit is{" "}
            <strong className="text-[var(--accent)]">{formatMoney(min, walletCurrency)}</strong>
            {firstDeposit > min && (
              <>
                , and your first deposit must be at least{" "}
                <strong className="text-[var(--accent)]">
                  {formatMoney(firstDeposit, walletCurrency)}
                </strong>
              </>
            )}
            .
          </li>
          <li>3. There are no transaction fees. The deposit is free.</li>
          <li>
            4. You can only withdraw to the mobile number you used to create your account.
          </li>
          <li>5. Deposit a high amount to claim your bonus. The bar fills as you deposit.</li>
        </ol>

        {whatsapp && (
          <a
            href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mx-4 mt-6 block rounded py-3 text-center text-[12px] font-bold text-[var(--accent)] ring-1 ring-[var(--line)]"
          >
            Payment problem? Chat on WhatsApp
          </a>
        )}

        <PayMarks />
      </div>
    </div>
  );
}

function BonusBar({
  deposited,
  adding,
  target,
}: {
  deposited: number;
  adding: number;
  target: number;
}) {
  const filled = Math.max(0, deposited);
  const preview = Math.min(target, filled + Math.max(0, adding));
  const confirmedPct = target > 0 ? Math.min(100, (Math.min(filled, target) / target) * 100) : 0;
  const previewPct = target > 0 ? Math.min(100, (preview / target) * 100) : 0;

  return (
    <div className="mx-4 mt-4">
      <p className="text-[13px] font-bold text-[var(--text-bright)]">
        Deposit a high amount to claim your bonus
      </p>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div className="relative h-full">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]/35 transition-[width] duration-300"
            style={{ width: `${previewPct}%` }}
          />
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)] transition-[width] duration-300"
            style={{ width: `${confirmedPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function PayMarks() {
  return (
    <div className="flex items-center justify-center gap-3 px-4 pb-10 pt-8" aria-label="Payment methods">
      <span
        className="flex h-10 items-center rounded-full bg-[#f7931a] px-2.5 text-[13px] font-black tracking-tight text-white"
        title="Bitcoin"
        aria-label="Bitcoin"
      >
        BTC
      </span>
      <span
        className="flex h-10 items-center rounded-md bg-[#ffcc00] px-2.5 text-[15px] font-black italic tracking-tight text-black"
        title="MTN"
        aria-label="MTN"
      >
        MTN
      </span>
      <span className="flex h-10 items-center rounded-md bg-white px-2 shadow-sm ring-1 ring-[var(--line)]" title="Credit card" aria-label="Credit card">
        <svg viewBox="0 0 44 28" width="40" height="26" aria-hidden>
          <rect width="44" height="28" rx="4" fill="#1434cb" />
          <rect y="6" width="44" height="6" fill="#f7b600" />
          <rect x="4" y="16" width="8" height="6" rx="1" fill="#d6deff" />
          <rect x="16" y="17" width="16" height="2" rx="0.5" fill="#fff" />
          <rect x="16" y="21" width="10" height="2" rx="0.5" fill="#9eb0ff" />
        </svg>
      </span>
      <span
        className="flex h-10 items-center rounded-md bg-[#e10600] px-2.5 text-[13px] font-black lowercase tracking-tight text-white"
        title="Telecel"
        aria-label="Telecel"
      >
        telecel
      </span>
    </div>
  );
}

function DepositHeader({ onBack }: { onBack: () => void }) {
  return (
    <header className="sticky top-0 z-40 bg-[#0f1c33]">
      <div className="mx-auto flex h-[56px] max-w-2xl items-center gap-3 px-4">
        <button onClick={onBack} aria-label="Back" className="text-white">
          <ArrowLeft size={22} strokeWidth={2} />
        </button>
        <h1 className="flex-1 text-[19px] font-black text-white">Deposit</h1>
        <Link href="/how-to-play" aria-label="Help" className="text-white/80">
          <CircleHelp size={20} strokeWidth={1.9} />
        </Link>
        <Link href="/" aria-label="Home" className="text-white/80">
          <Home size={20} strokeWidth={1.9} />
        </Link>
      </div>
    </header>
  );
}

function SwitchRow({
  icon,
  value,
  action,
  muted,
  onAction,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  action: string;
  muted?: boolean;
  onAction: () => void;
}) {
  return (
    <div className="mx-4 mt-3 flex items-center gap-3 rounded-2xl bg-white px-3 py-3.5 shadow-sm">
      {icon}
      <span className="flex-1 text-[15px]">{value}</span>
      <button
        onClick={onAction}
        className="flex items-center gap-0.5 text-[14px] font-medium"
        style={{ color: muted ? "var(--text-muted)" : "var(--accent)" }}
      >
        {action}
        <ChevronRight size={16} strokeWidth={2.2} />
      </button>
    </div>
  );
}

function AmountField({
  currency,
  value,
  onChange,
  hint,
}: {
  currency: string;
  value: string;
  onChange: (v: string) => void;
  hint: string;
}) {
  return (
    <div className="mx-4 mt-2 flex items-center gap-3 rounded-[4px] bg-[var(--bg-elevated)] px-3 py-3.5 ring-1 ring-[var(--line)]">
      <label htmlFor="amount" className="shrink-0 text-[15px] text-[var(--text-bright)]">
        Amount ({currency})
      </label>
      <input
        id="amount"
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hint}
        className="min-w-0 flex-1 bg-transparent text-right text-[16px] font-bold outline-none placeholder:font-normal placeholder:text-[var(--text-muted)]"
      />
    </div>
  );
}
