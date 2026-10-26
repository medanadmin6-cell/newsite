"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/lib/store";
import { getCountry, normalisePhone } from "@/lib/countries";
import { CountryBar, PhoneField, PasswordField, PrimaryButton } from "@/components/AuthFields";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/";
  const signIn = useSession((s) => s.signIn);

  const [countryCode, setCountryCode] = useState("GH");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const country = getCountry(countryCode);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || !password) {
      setError("Enter your number and password");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Send the number in full international form so the server does not have
      // to guess which market a bare local number belongs to.
      const identifier = normalisePhone(phone, countryCode) ?? phone;

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Wrong login details");
        return;
      }
      signIn(json.user);
      router.push(next);
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="mx-auto w-full max-w-[455px] px-6 pb-16 pt-5">
        <CountryBar
          country={country}
          onChange={setCountryCode}
          onClose={() => router.push("/")}
        />

        <form onSubmit={submit} className="mt-8 space-y-4">
          <PhoneField country={country} value={phone} onChange={setPhone} autoFocus />
          <PasswordField value={password} onChange={setPassword} />

          {error && (
            <p className="rounded-[3px] bg-[var(--lose-bg)] px-3 py-2.5 text-[13px] text-[var(--lose)]">
              {error}
            </p>
          )}

          <div className="pt-2">
            <PrimaryButton type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Login"}
            </PrimaryButton>
          </div>
        </form>

        <div className="mt-5 flex items-center justify-between">
          <Link href="/forgot-password" className="text-[15px] font-medium text-[var(--accent)]">
            Forgot Password ?
          </Link>
          <Link href="/register" className="text-[15px] font-medium text-[var(--accent)]">
            Create New Account
          </Link>
        </div>

        <p className="mt-10 text-center text-[15px] text-[var(--text-muted)]">Or</p>

        <p className="mt-8 text-[15px] leading-relaxed text-[var(--text-muted)]">
          To deactivate or reactivate your account{" "}
          <Link href="/account-status" className="font-medium text-[var(--accent)]">
            click here
          </Link>{" "}
          .
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
