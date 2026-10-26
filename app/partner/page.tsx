"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { WalletPanel } from "@/components/partner/WalletPanel";

interface Partner {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  referral_code: string;
  approved: boolean;
  user_id: string | null;
  balances: Record<string, number>;
  lifetime: Record<string, number>;
  payout_name: string | null;
  payout_network: string | null;
  payout_number: string | null;
}

interface Wallet {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  country_code: string;
  currency: string;
  balance: number;
}

interface Dashboard {
  partner: Partner;
  players: { id: string; name: string; phone: string; currency: string; total_deposited: number; created_at: string }[];
  commissions: { id: string; deposit_amount: number; currency: string; rate: number; amount: number; created_at: string }[];
  commissionToday: Record<string, number>;
  commissionCountToday: number;
  wallet: Wallet | null;
  creditedToday: number;
  dailyLimit: number;
}

export default function PartnerPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [checked, setChecked] = useState(false);

  // Bumping the nonce re-runs the effect; that is how a sign-in or sign-out
  // refreshes the dashboard without the effect body calling setState directly.
  const [nonce, setNonce] = useState(0);
  const load = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch("/api/partner/dashboard");
        const json = res.ok ? await res.json() : null;
        if (alive) setData(json);
      } catch {
        if (alive) setData(null);
      } finally {
        if (alive) setChecked(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, [nonce]);

  if (!checked) return null;

  if (!data) {
    return (
      <div className="mx-auto max-w-sm px-4 py-10">
        <Link href="/" className="mb-8 flex justify-center">
          <Image src="/logo.svg" alt="Velora" width={160} height={35} priority />
        </Link>

        <div className="mb-4 flex gap-1.5">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="flex-1 rounded py-2 text-[12px] font-bold capitalize"
              style={
                mode === m
                  ? { background: "var(--accent)", color: "var(--accent-ink)" }
                  : { background: "var(--surface)", color: "var(--text-muted)" }
              }
            >
              {m === "login" ? "Partner login" : "Become a partner"}
            </button>
          ))}
        </div>

        <PartnerAuth mode={mode} onDone={load} />
      </div>
    );
  }

  return <PartnerDashboard data={data} onReload={load} />;
}

function PartnerAuth({ mode, onDone }: { mode: "login" | "register"; onDone: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/partner/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed");
        return;
      }
      if (mode === "register") setMessage(json.message);
      else onDone();
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {mode === "register" && (
        <>
          <Field label="Your name">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Phone (optional)">
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className={inputClass}
            />
          </Field>
        </>
      )}

      <Field label="Email">
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
          autoComplete="username"
          className={inputClass}
        />
      </Field>

      <Field label="Password">
        <input
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className={inputClass}
        />
      </Field>

      {error && <p className="rounded bg-[var(--lose)]/15 px-3 py-2 text-[12px] text-[var(--lose)]">{error}</p>}
      {message && <p className="rounded bg-[var(--win)]/15 px-3 py-2 text-[12px] text-[var(--win)]">{message}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded bg-[var(--accent)] py-3 text-[14px] font-black text-[var(--accent-ink)] disabled:opacity-50"
      >
        {busy ? "Working…" : mode === "login" ? "Sign in" : "Create partner account"}
      </button>

      {mode === "register" && (
        <p className="text-center text-[11px] text-[var(--text-faint)]">
          You earn 70% of every deposit your players make — not just their first.
        </p>
      )}
    </form>
  );
}

function PartnerDashboard({ data, onReload }: { data: Dashboard; onReload: () => void }) {
  const { partner, players, commissions, commissionToday, commissionCountToday, wallet, creditedToday, dailyLimit } =
    data;
  const [payout, setPayout] = useState({
    payout_name: partner.payout_name ?? "",
    payout_network: partner.payout_network ?? "",
    payout_number: partner.payout_number ?? "",
  });
  const [note, setNote] = useState<string | null>(null);

  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/register?ref=${partner.referral_code}`
      : "";

  const savePayout = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/partner/dashboard", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payout),
    });
    setNote(res.ok ? "Saved." : "Could not save.");
    if (res.ok) onReload();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-3 px-4 py-6 md:px-6">
      <header className="flex items-center justify-between">
        <Link href="/">
          <Image src="/logo.svg" alt="Velora" width={130} height={29} />
        </Link>
        <button
          onClick={async () => {
            await fetch("/api/partner/logout", { method: "POST" });
            onReload();
          }}
          className="text-[12px] font-semibold text-[var(--text-faint)]"
        >
          Log out
        </button>
      </header>

      {!partner.approved && (
        <p className="rounded bg-[var(--pending)]/15 px-4 py-3 text-[12px] text-[var(--pending)]">
          Your account is waiting for operator approval. You can sign in, but commission is not paid
          on deposits until you are approved.
        </p>
      )}

      <section className="rounded bg-gradient-to-br from-[var(--surface)] to-[var(--surface-2)] p-4">
        <p className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Your referral code</p>
        <p className="text-[28px] font-black tracking-[0.15em] text-[var(--accent)]">
          {partner.referral_code}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-[var(--bg)] px-2 py-1.5 text-[11px] text-[var(--text-muted)]">
            {link}
          </code>
          <button
            onClick={() => navigator.clipboard?.writeText(link)}
            className="rounded bg-[var(--accent)] px-3 py-1.5 text-[11px] font-black text-[var(--accent-ink)]"
          >
            Copy
          </button>
        </div>
      </section>

      <WalletPanel
        wallet={wallet}
        approved={partner.approved}
        defaultPhone={partner.phone}
        creditedToday={creditedToday}
        dailyLimit={dailyLimit}
        onChanged={onReload}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          label="Commission today"
          value={<Money totals={commissionToday} />}
          note={
            commissionCountToday
              ? `${commissionCountToday} deposit${commissionCountToday === 1 ? "" : "s"} so far`
              : "No deposits yet today"
          }
          accent
        />
        <Card label="Referred players" value={String(players.length)} />
        <Card label="Owed to you" value={<Money totals={partner.balances} />} />
        <Card label="Earned all time" value={<Money totals={partner.lifetime} />} />
      </div>

      <section className="overflow-hidden rounded bg-[var(--bg-elevated)]">
        <h2 className="border-b border-[var(--line)] px-4 py-2.5 text-[13px] font-bold">
          Where to pay you
        </h2>
        <form onSubmit={savePayout} className="grid gap-2 p-4 sm:grid-cols-3">
          <input
            placeholder="Account name"
            value={payout.payout_name}
            onChange={(e) => setPayout({ ...payout, payout_name: e.target.value })}
            className={inputClass}
          />
          <input
            placeholder="Network or bank"
            value={payout.payout_network}
            onChange={(e) => setPayout({ ...payout, payout_network: e.target.value })}
            className={inputClass}
          />
          <input
            placeholder="Number"
            value={payout.payout_number}
            onChange={(e) => setPayout({ ...payout, payout_number: e.target.value })}
            className={inputClass}
          />
          <button
            type="submit"
            className="rounded bg-[var(--accent)] py-2 text-[12px] font-black text-[var(--accent-ink)] sm:col-span-3"
          >
            Save payout details
          </button>
          {note && <p className="text-[11px] text-[var(--text-muted)] sm:col-span-3">{note}</p>}
        </form>
      </section>

      <section className="overflow-hidden rounded bg-[var(--bg-elevated)]">
        <h2 className="border-b border-[var(--line)] px-4 py-2.5 text-[13px] font-bold">
          Your players
        </h2>
        {!players.length ? (
          <p className="p-8 text-center text-[13px] text-[var(--text-muted)]">
            No one has signed up with your code yet.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {players.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-[13px] font-semibold">{p.name}</p>
                  <p className="text-[11px] text-[var(--text-faint)]">{p.phone}</p>
                </div>
                <p className="text-[13px] font-bold">
                  {p.currency} {Number(p.total_deposited).toFixed(2)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-hidden rounded bg-[var(--bg-elevated)]">
        <h2 className="border-b border-[var(--line)] px-4 py-2.5 text-[13px] font-bold">
          Commission history
        </h2>
        {!commissions.length ? (
          <p className="p-8 text-center text-[13px] text-[var(--text-muted)]">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {commissions.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-[12px]">
                    Deposit {c.currency} {Number(c.deposit_amount).toFixed(2)}
                  </p>
                  <p className="text-[11px] text-[var(--text-faint)]">
                    {new Date(c.created_at).toLocaleString()} · {(Number(c.rate) * 100).toFixed(0)}%
                  </p>
                </div>
                <p className="text-[13px] font-bold text-[var(--accent)]">
                  +{c.currency} {Number(c.amount).toFixed(2)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const inputClass =
  "w-full rounded bg-[var(--surface-2)] px-3 py-2.5 text-[13px] outline-none focus:ring-1 focus:ring-[var(--accent)]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Card({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded bg-[var(--bg-elevated)] p-4">
      <p className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">{label}</p>
      <div
        className="mt-0.5 text-[18px] font-black"
        style={accent ? { color: "var(--accent)" } : undefined}
      >
        {value}
      </div>
      {note && <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{note}</p>}
    </div>
  );
}

function Money({ totals }: { totals: Record<string, number> }) {
  const entries = Object.entries(totals ?? {}).filter(([, v]) => v);
  if (!entries.length) return <span className="text-[var(--text-faint)]">—</span>;
  return (
    <>
      {entries.map(([currency, amount]) => (
        <p key={currency}>
          {currency} {Number(amount).toFixed(2)}
        </p>
      ))}
    </>
  );
}
