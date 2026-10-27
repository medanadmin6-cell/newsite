"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";

function AdminLoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/admin";
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Wrong password");
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xs py-20">
      <div className="mb-8 flex justify-center">
        <Image src="/logo.svg" alt="Betvanta" width={150} height={33} priority />
      </div>
      <h1 className="mb-4 text-center text-[15px] font-bold">Operator console</h1>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Admin password"
          autoComplete="current-password"
          className="w-full rounded bg-[var(--surface-2)] px-3 py-2.5 text-[14px] outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
        {error && (
          <p className="rounded bg-[var(--lose)]/15 px-3 py-2 text-[12px] text-[var(--lose)]">{error}</p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-[var(--accent)] py-2.5 text-[13px] font-black text-[var(--accent-ink)] disabled:opacity-50"
        >
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  );
}
