"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, X } from "lucide-react";
import { useSession } from "@/lib/store";
import { formatMoney } from "@/lib/countries";

/**
 * Where a 3-D Secure trip lands.
 *
 * The bank has told the rail what happened; it has not told us. So this page
 * asks, and keeps asking for a short while, because a charge is sometimes still
 * settling at the moment the player is handed back.
 */
export default function CheckoutReturnPage() {
  return (
    <Suspense fallback={<Waiting />}>
      <Return />
    </Suspense>
  );
}

function Return() {
  const router = useRouter();
  const reference = useSearchParams().get("reference") ?? "";
  const player = useSession((s) => s.player);
  const setBalance = useSession((s) => s.setBalance);

  const [state, setState] = useState<{ kind: "waiting" } | { kind: "done"; balance?: number; bonus?: number } | { kind: "failed" }>({
    kind: "waiting",
  });

  useEffect(() => {
    if (!reference) return;
    let tries = 0;
    let stop = false;

    const ask = async () => {
      tries++;
      try {
        const res = await fetch(`/api/deposits/status?reference=${encodeURIComponent(reference)}`);
        const json = await res.json();
        if (json.status === "confirmed") {
          if (typeof json.balance === "number") setBalance(json.balance);
          setState({ kind: "done", balance: json.balance, bonus: json.bonusPaid });
          return;
        }
        if (json.status === "failed") {
          setState({ kind: "failed" });
          return;
        }
      } catch {
        /* try again */
      }
      // Roughly a minute of patience, then the account page can pick it up.
      if (!stop && tries < 15) setTimeout(ask, 4000);
      else if (!stop) router.replace("/account");
    };

    void ask();
    return () => {
      stop = true;
    };
  }, [reference, router, setBalance]);

  if (state.kind === "waiting") return <Waiting />;

  if (state.kind === "failed") {
    return (
      <Screen>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--lose-bg)] text-[var(--lose)]">
          <X size={34} strokeWidth={3} />
        </div>
        <h1 className="text-[20px] font-black">Payment not completed</h1>
        <p className="text-[13px] text-[var(--text-muted)]">Nothing was taken from your card.</p>
        <button
          onClick={() => router.push("/deposit")}
          className="w-full rounded bg-[var(--accent)] py-3 text-[14px] font-black text-[var(--accent-ink)]"
        >
          Try again
        </button>
      </Screen>
    );
  }

  return (
    <Screen>
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)]">
        <Check size={34} strokeWidth={3} />
      </div>
      <h1 className="text-[20px] font-black">Payment received</h1>
      {state.bonus && player ? (
        <p className="text-[13px] text-[var(--accent)]">
          Plus a {formatMoney(state.bonus, player.currency)} welcome bonus.
        </p>
      ) : null}
      {typeof state.balance === "number" && player && (
        <p className="text-[15px] font-bold">New balance {formatMoney(state.balance, player.currency)}</p>
      )}
      <button
        onClick={() => router.push("/")}
        className="w-full rounded bg-[var(--accent)] py-3 text-[14px] font-black text-[var(--accent-ink)]"
      >
        Start betting
      </button>
    </Screen>
  );
}

function Waiting() {
  return (
    <Screen>
      <p className="text-[14px] text-[var(--text-muted)]">Confirming your payment…</p>
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="mx-auto max-w-md space-y-4 px-6 py-20 text-center">{children}</div>
    </div>
  );
}
