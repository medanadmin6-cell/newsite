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
  Upload,
} from "lucide-react";
import { useSession } from "@/lib/store";
import { getCountry, formatMoney, localSignificant } from "@/lib/countries";

type Rail = "momo" | "manual";

/**
 * The deposit screen.
 *
 * Two rails behind two tabs: the country's instant gateway, and the manual
 * transfer that every market falls back to. The limits and fee notes at the
 * bottom are read from the same country configuration the endpoint enforces,
 * so what a player is told is what actually happens.
 */
export default function DepositPage() {
  const router = useRouter();
  const player = useSession((s) => s.player);
  const hydrated = useSession((s) => s.hydrated);
  const setBalance = useSession((s) => s.setBalance);

  const [rail, setRail] = useState<Rail>("momo");
  const [amount, setAmount] = useState("");
  const [phoneEdit, setPhoneEdit] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [switching, setSwitching] = useState<"phone" | "network" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [done, setDone] = useState<{ balance?: number; bonus?: number } | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const country = player ? getCountry(player.country_code) : getCountry("GH");
  const phone = phoneEdit ?? player?.phone ?? "";
  const chosenNetwork = network ?? country.networks[0];
  const whatsapp = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP;

  const value = Number(amount);
  const firstDeposit = country.minFirstDeposit;
  const min = country.minDeposit;
  const max = country.maxDeposit;

  useEffect(() => {
    if (hydrated && !player) router.replace("/login");
  }, [hydrated, player, router]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.settings && setSettings(j.settings))
      .catch(() => {});
  }, []);

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

  const submitManual = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const form = new FormData(e.currentTarget);
      form.set("userId", player.id);
      form.set("amount", String(value));

      const res = await fetch("/api/deposits/manual", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not record your deposit");
        return;
      }
      setStatus(json.message);
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
            <p className="text-[13px] text-[var(--accent)]">
              Plus a {formatMoney(done.bonus, player.currency)} welcome bonus.
            </p>
          ) : null}
          {typeof done.balance === "number" && (
            <p className="text-[15px] font-bold">
              New balance {formatMoney(done.balance, player.currency)}
            </p>
          )}
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
        {/* Rail tabs */}
        <div className="grid grid-cols-2">
          {(
            [
              { key: "momo", label: country.payoutRail === "bank" ? "Card / Bank" : "Mobile Money" },
              { key: "manual", label: "Manual transfer" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setRail(t.key);
                setError(null);
                setStatus(null);
              }}
              className="relative py-3.5 text-[15px]"
              style={{
                color: rail === t.key ? "var(--text-bright)" : "var(--text-muted)",
                fontWeight: rail === t.key ? 700 : 400,
              }}
            >
              {t.label}
              {rail === t.key && (
                <span className="absolute inset-x-6 bottom-0 h-[3px] rounded-full bg-[var(--accent)]" />
              )}
            </button>
          ))}
        </div>

        {rail === "momo" ? (
          <>
            {/* Account rows */}
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
              Balance ({player.currency}) {Number(player.balance).toFixed(2)}
            </p>

            <AmountField
              currency={player.currency}
              value={amount}
              onChange={setAmount}
              hint={`min. ${min.toFixed(2)}`}
            />

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
          </>
        ) : (
          <form onSubmit={submitManual}>
            <div className="mx-4 mt-4 rounded bg-[var(--bg-elevated)] p-4">
              <p className="text-[12px] text-[var(--text-muted)]">Send to</p>
              <p className="mt-0.5 text-[20px] font-black tracking-wide text-[var(--accent)]">
                {settings.deposit_account_number ?? "—"}
              </p>
              <p className="text-[12px] text-[var(--text-muted)]">
                {settings.deposit_account_name ?? "Velora"} ·{" "}
                {settings.deposit_account_network ?? "Mobile Money"}
              </p>
            </div>

            <AmountField
              currency={player.currency}
              value={amount}
              onChange={setAmount}
              hint={`min. ${min.toFixed(2)}`}
            />

            <div className="space-y-3 px-4 pt-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
                  Number you sent from
                </span>
                <input
                  name="senderNumber"
                  type="tel"
                  defaultValue={player.phone}
                  className="w-full rounded bg-[var(--surface-2)] px-3 py-2.5 text-[14px] outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />
              </label>

              <label className="flex cursor-pointer items-center gap-2 rounded bg-[var(--surface-2)] px-3 py-3 text-[13px] text-[var(--text-muted)]">
                <Upload size={16} strokeWidth={1.9} />
                Screenshot of the transfer
                <input name="screenshot" type="file" accept="image/*" className="sr-only" />
              </label>

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-[4px] py-3.5 text-[16px] font-bold"
                style={
                  canSubmit
                    ? { background: "var(--accent)", color: "var(--accent-ink)" }
                    : { background: "var(--surface)", color: "var(--text-muted)" }
                }
              >
                {busy ? "Sending…" : "I have sent the money"}
              </button>
            </div>
          </form>
        )}

        {/* Feedback */}
        <div className="space-y-2 px-4 pt-3">
          {tooSmall && (
            <p className="text-[12px] text-[var(--lose)]">
              The minimum deposit is {formatMoney(min, player.currency)}.
            </p>
          )}
          {tooBig && (
            <p className="text-[12px] text-[var(--lose)]">
              The most you can send in one transaction is {formatMoney(max, player.currency)}.
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
        <ol className="mt-6 space-y-2 px-4 pb-10 text-[13px] leading-relaxed text-[var(--text-muted)]">
          <li>
            1. The maximum amount per transaction is{" "}
            <strong className="text-[var(--accent)]">{formatMoney(max, player.currency)}</strong>. To
            deposit more than that, make multiple payments.
          </li>
          <li>
            2. The minimum you can deposit is{" "}
            <strong className="text-[var(--accent)]">{formatMoney(min, player.currency)}</strong>
            {firstDeposit > min && (
              <>
                , and your first deposit must be at least{" "}
                <strong className="text-[var(--accent)]">
                  {formatMoney(firstDeposit, player.currency)}
                </strong>
              </>
            )}
            .
          </li>
          <li>3. There are no transaction fees. The deposit is free.</li>
          <li>
            4. You can only withdraw to the mobile number you used to create your account.
          </li>
        </ol>

        {whatsapp && (
          <a
            href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mx-4 mb-10 block rounded py-3 text-center text-[12px] font-bold text-[var(--accent)] ring-1 ring-[var(--line)]"
          >
            Payment problem? Chat on WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}

function DepositHeader({ onBack }: { onBack: () => void }) {
  return (
    <header className="sticky top-0 z-40 bg-[var(--surface)]">
      <div className="mx-auto flex h-[52px] max-w-2xl items-center gap-3 px-4">
        <button onClick={onBack} aria-label="Back" className="text-[var(--text-bright)]">
          <ArrowLeft size={22} strokeWidth={2} />
        </button>
        <h1 className="flex-1 text-[19px] font-bold text-[var(--text-bright)]">Deposit</h1>
        <Link href="/how-to-play" aria-label="Help" className="text-[var(--text-bright)]">
          <CircleHelp size={20} strokeWidth={1.9} />
        </Link>
        <Link href="/" aria-label="Home" className="text-[var(--text-bright)]">
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
    <div className="mx-4 mt-3 flex items-center gap-3 rounded-[4px] bg-[var(--bg-elevated)] px-3 py-3.5 ring-1 ring-[var(--line)]">
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
