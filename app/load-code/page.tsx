"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Shell";
import { BetSlip } from "@/components/BetSlip";
import { useSlip, type SlipLeg } from "@/lib/store";

/** Load a booking code and drop its selections straight into the slip. */
export default function LoadCodePage() {
  const router = useRouter();
  const load = useSlip((s) => s.load);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setTicket(null);
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(code.trim().toUpperCase())}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "That code was not found");
        if (json.ticket) setTicket(json.ticket as string);
        return;
      }
      load(json.booking.selections as SlipLeg[]);
      router.push("/");
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <div className="mx-auto max-w-sm space-y-4 py-6">
        <h1 className="text-[18px] font-black">Load a booking code</h1>
        <p className="text-[13px] text-[var(--text-muted)]">
          Enter a code someone shared with you to get the same selections on your slip.
        </p>

        <form onSubmit={submit} className="space-y-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={6}
            className="w-full rounded bg-[var(--surface-2)] px-3 py-4 text-center text-[24px] font-black tracking-[0.25em] outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />

          {error && (
            <p className="rounded bg-[var(--lose)]/15 px-3 py-2 text-[12px] text-[var(--lose)]">
              {error}
              {ticket && (
                <>
                  {" "}
                  <Link href={`/my-bets/${ticket}`} className="font-bold text-[var(--accent)] underline">
                    Open it in My Bets
                  </Link>
                </>
              )}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || code.trim().length < 4}
            className="w-full rounded bg-[var(--accent)] py-3 text-[14px] font-black text-[var(--accent-ink)] disabled:opacity-50"
          >
            {busy ? "Loading…" : "Load code"}
          </button>
        </form>
      </div>

      <BetSlip />
    </Page>
  );
}
