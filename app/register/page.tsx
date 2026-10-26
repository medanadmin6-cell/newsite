"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/lib/store";
import { getCountry } from "@/lib/countries";
import { CountryBar, PhoneField, PasswordField, Check, PrimaryButton } from "@/components/AuthFields";

function RegisterForm() {
  const router = useRouter();
  const signIn = useSession((s) => s.signIn);
  const refFromUrl = useSearchParams().get("ref") ?? "";

  const [countryCode, setCountryCode] = useState("GH");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [kycValue, setKycValue] = useState("");
  const [referralCode, setReferralCode] = useState(refFromUrl);
  const [showReferral, setShowReferral] = useState(Boolean(refFromUrl));
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const country = getCountry(countryCode);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Enter your name");
    if (!phone.trim()) return setError("Enter your mobile number");
    if (!password) return setError("Choose a password");
    if (!agreed) return setError("Accept the terms to continue");

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, password, countryCode, kycValue, referralCode }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not create your account");
        return;
      }
      signIn(json.user);
      // Straight to the board. A new player should see what they can bet on
      // before being asked for money.
      router.push("/");
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="mx-auto w-full max-w-[455px] px-6 pb-16 pt-5">
        <CountryBar country={country} onChange={setCountryCode} onClose={() => router.push("/")} />

        <form onSubmit={submit} className="mt-8 space-y-4">
          <PhoneField country={country} value={phone} onChange={setPhone} autoFocus />

          <ShellInput
            value={name}
            onChange={setName}
            placeholder="Full name"
            autoComplete="name"
          />

          <PasswordField
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            placeholder="Password"
          />

          {country.kyc.length > 0 && (
            <ShellInput
              value={kycValue}
              onChange={setKycValue}
              placeholder={`${country.kyc[0].label} — ${country.kyc[0].hint}`}
            />
          )}

          {showReferral ? (
            <ShellInput
              value={referralCode}
              onChange={(v) => setReferralCode(v.toUpperCase())}
              placeholder="Referral code"
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowReferral(true)}
              className="text-[14px] font-medium text-[var(--accent)]"
            >
              Have a referral code?
            </button>
          )}

          <div className="pt-1">
            <Check
              checked={agreed}
              onChange={setAgreed}
              label="I am 18+ and accept the terms"
            />
          </div>

          {error && (
            <p className="rounded-[3px] bg-[var(--lose-bg)] px-3 py-2.5 text-[13px] text-[var(--lose)]">
              {error}
            </p>
          )}

          <div className="pt-2">
            <PrimaryButton type="submit" disabled={busy}>
              {busy ? "Creating…" : "Register"}
            </PrimaryButton>
          </div>
        </form>

        <p className="mt-6 text-center text-[15px] text-[var(--text-muted)]">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-[var(--accent)]">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}

/** A plain text input in the same inverted shell the phone field uses. */
function ShellInput({
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div className="rounded-[3px] bg-[var(--field)] px-3 py-2 ring-1 ring-[var(--field-line)]">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full rounded-[2px] bg-[var(--input)] px-2 py-2 text-[15px] text-[var(--input-ink)] outline-none placeholder:text-[var(--input-placeholder)] focus:ring-1 focus:ring-[var(--accent)]"
      />
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
