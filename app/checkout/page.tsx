"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, CreditCard, Lock } from "lucide-react";
import { useSession } from "@/lib/store";
import { formatMoney } from "@/lib/countries";

/**
 * Our own checkout.
 *
 * The card is typed here, on our page, and posted to our own endpoint, which
 * encrypts it and hands it to the rail. Nothing about the card is kept: the
 * fields live in component state until they are sent, and the server holds them
 * only long enough to encrypt them.
 *
 * Whatever the bank asks for next — a PIN, an OTP, a billing address, a trip to
 * a 3-D Secure page — is answered on this same screen, so the only time a player
 * leaves the site is when their own bank insists on it.
 */
type Step =
  | { kind: "card" }
  | { kind: "pin" }
  | { kind: "otp" }
  | { kind: "avs"; fields: string[] }
  | { kind: "waiting" }
  | { kind: "done"; balance?: number; bonus?: number };

interface Session {
  reference: string;
  amount: number;
  currency: string;
  status: string;
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<Shell><p className="px-4 py-10 text-center text-[14px] text-[var(--text-muted)]">Loading…</p></Shell>}>
      <Checkout />
    </Suspense>
  );
}

function Checkout() {
  const router = useRouter();
  const params = useSearchParams();
  const reference = params.get("reference") ?? "";
  const player = useSession((s) => s.player);
  const hydrated = useSession((s) => s.hydrated);
  const setBalance = useSession((s) => s.setBalance);

  const [session, setSession] = useState<Session | null>(null);
  const [step, setStep] = useState<Step>({ kind: "card" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState({ line1: "", city: "", state: "", postal_code: "", country: "" });

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (hydrated && !player) router.replace("/login");
  }, [hydrated, player, router]);

  useEffect(() => {
    if (!reference) return;
    fetch(`/api/deposits/card/session?reference=${encodeURIComponent(reference)}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setSession(j)))
      .catch(() => setError("Could not load this payment"));
  }, [reference]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  /** Watch the charge until the rail decides, then credit and say so. */
  const watch = useCallback(() => {
    setStep({ kind: "waiting" });
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/deposits/status?reference=${encodeURIComponent(reference)}`);
        const json = await res.json();
        if (json.status === "confirmed") {
          if (pollRef.current) clearInterval(pollRef.current);
          if (typeof json.balance === "number") setBalance(json.balance);
          setStep({ kind: "done", balance: json.balance, bonus: json.bonusPaid });
        } else if (json.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setStep({ kind: "card" });
          setError("That payment did not go through. Try another card.");
        }
      } catch {
        /* keep watching */
      }
    }, 4000);
  }, [reference, setBalance]);

  /** One place to act on whatever the rail says it wants next. */
  const advance = useCallback(
    (next: { kind: string; url?: string; fields?: string[] }) => {
      switch (next.kind) {
        case "redirect":
          if (next.url) window.location.href = next.url;
          return;
        case "pin":
          setStep({ kind: "pin" });
          return;
        case "otp":
          setStep({ kind: "otp" });
          return;
        case "avs":
          setStep({ kind: "avs", fields: next.fields ?? [] });
          return;
        case "failed":
          setStep({ kind: "card" });
          setError("That payment did not go through. Try another card.");
          return;
        default:
          watch();
      }
    },
    [watch],
  );

  const post = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, userId: player?.id, ...body }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "That did not go through");
        return;
      }
      advance(json.step ?? { kind: "pending" });
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!player) return null;

  if (!reference || (error && !session)) {
    return (
      <Shell>
        <p className="px-4 py-10 text-center text-[14px] text-[var(--text-muted)]">
          {error ?? "That payment link is not valid."}
        </p>
      </Shell>
    );
  }

  if (step.kind === "done") {
    return (
      <Shell>
        <div className="space-y-4 px-6 py-14 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)]">
            <Check size={34} strokeWidth={3} />
          </div>
          <h1 className="text-[20px] font-black">Payment received</h1>
          {step.bonus ? (
            <p className="text-[13px] text-[var(--accent)]">
              Plus a {formatMoney(step.bonus, player.currency)} welcome bonus.
            </p>
          ) : null}
          {typeof step.balance === "number" && (
            <p className="text-[15px] font-bold">New balance {formatMoney(step.balance, player.currency)}</p>
          )}
          <button
            onClick={() => router.push("/")}
            className="w-full rounded bg-[var(--accent)] py-3 text-[14px] font-black text-[var(--accent-ink)]"
          >
            Start betting
          </button>
        </div>
      </Shell>
    );
  }

  const cardReady = number.replace(/\D/g, "").length >= 12 && /^\d{2}\/\d{2}$/.test(expiry) && cvv.length >= 3;

  return (
    <Shell>
      {session && (
        <div className="border-b border-[var(--line)] px-4 py-4">
          <p className="text-[13px] text-[var(--text-muted)]">Paying</p>
          <p className="text-[24px] font-black">{formatMoney(session.amount, session.currency)}</p>
        </div>
      )}

      {error && (
        <p className="mx-4 mt-4 rounded bg-[var(--lose-bg)] px-3 py-2.5 text-[12px] text-[var(--lose)]">{error}</p>
      )}

      {step.kind === "waiting" && (
        <p className="px-4 py-10 text-center text-[14px] text-[var(--text-muted)]">
          Confirming with your bank. Stay on this page.
        </p>
      )}

      {step.kind === "card" && (
        <form
          className="space-y-3 px-4 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            void post("/api/deposits/card/charge", { number, expiry, cvv });
          }}
        >
          <Field label="Card number">
            <input
              value={number}
              onChange={(e) => setNumber(formatCardNumber(e.target.value))}
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="0000 0000 0000 0000"
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Expiry">
              <input
                value={expiry}
                onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="MM/YY"
                className={inputClass}
              />
            </Field>
            <Field label="CVV">
              <input
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder="123"
                className={inputClass}
              />
            </Field>
          </div>

          <SubmitButton disabled={!cardReady || busy} label={busy ? "Working…" : "Pay now"} />
        </form>
      )}

      {step.kind === "pin" && (
        <form
          className="space-y-3 px-4 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            void post("/api/deposits/card/authorize", { type: "pin", pin });
          }}
        >
          <Field label="Card PIN">
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              type="password"
              placeholder="••••"
              className={inputClass}
            />
          </Field>
          <SubmitButton disabled={pin.length < 4 || busy} label={busy ? "Working…" : "Continue"} />
        </form>
      )}

      {step.kind === "otp" && (
        <form
          className="space-y-3 px-4 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            void post("/api/deposits/card/authorize", { type: "otp", code });
          }}
        >
          <Field label="One-time code">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\s/g, "").slice(0, 8))}
              inputMode="numeric"
              placeholder="Code from your bank"
              className={inputClass}
            />
          </Field>
          <SubmitButton disabled={!code || busy} label={busy ? "Working…" : "Confirm"} />
        </form>
      )}

      {step.kind === "avs" && (
        <form
          className="space-y-3 px-4 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            void post("/api/deposits/card/authorize", { type: "avs", address });
          }}
        >
          <p className="text-[13px] text-[var(--text-muted)]">Your bank wants the address this card is billed to.</p>
          {(
            [
              ["line1", "Street address"],
              ["city", "City"],
              ["state", "State"],
              ["postal_code", "Postal code"],
              ["country", "Country code (e.g. US)"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                value={address[key]}
                onChange={(e) => setAddress({ ...address, [key]: e.target.value })}
                className={inputClass}
              />
            </Field>
          ))}
          <SubmitButton
            disabled={!address.line1 || !address.city || !address.country || busy}
            label={busy ? "Working…" : "Confirm"}
          />
        </form>
      )}

      <p className="flex items-center justify-center gap-1.5 px-4 py-6 text-[12px] text-[var(--text-muted)]">
        <Lock size={12} strokeWidth={2} />
        Encrypted before it leaves this page. We never store your card.
      </p>
    </Shell>
  );
}

const inputClass =
  "w-full rounded bg-[var(--surface-2)] px-3 py-3 text-[15px] outline-none focus:ring-1 focus:ring-[var(--accent)]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[12px] text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  );
}

function SubmitButton({ disabled, label }: { disabled: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="w-full rounded-[4px] py-3.5 text-[16px] font-bold transition-colors"
      style={
        disabled
          ? { background: "var(--surface-2)", color: "var(--text-muted)" }
          : { background: "var(--accent)", color: "var(--accent-ink)" }
      }
    >
      {label}
    </button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3.5">
        <button onClick={() => router.back()} aria-label="Back">
          <ArrowLeft size={20} strokeWidth={2} />
        </button>
        <span className="flex items-center gap-1.5 text-[15px] font-bold">
          <CreditCard size={16} strokeWidth={2} />
          Checkout
        </span>
      </header>
      <div className="mx-auto max-w-md">{children}</div>
    </div>
  );
}

/** 4-4-4-4 as it is typed, up to the 19 digits a card can carry. */
function formatCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 19);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiry(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`;
}
