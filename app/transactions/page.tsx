"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Handshake } from "lucide-react";
import { Page } from "@/components/Shell";
import { useSession } from "@/lib/store";
import { formatMoney } from "@/lib/countries";

interface Txn {
  reference: string;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  metadata: { type?: string; note?: string };
  created_at: string;
  resolved_at: string | null;
}

const TONE: Record<string, string> = {
  confirmed: "var(--win)",
  resolved: "var(--win)",
  pending: "var(--pending)",
  failed: "var(--lose)",
};

export default function TransactionsPage() {
  const router = useRouter();
  const player = useSession((s) => s.player);
  const hydrated = useSession((s) => s.hydrated);
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (hydrated && !player) router.replace("/login");
  }, [hydrated, player, router]);

  useEffect(() => {
    if (!player) return;
    fetch(`/api/transactions?userId=${player.id}`)
      .then((r) => (r.ok ? r.json() : { transactions: [] }))
      .then((j) => setTxns(j.transactions ?? []))
      .catch(() => setTxns([]));
  }, [player]);

  if (!player) return null;

  const shown = (txns ?? []).filter((t) => filter === "all" || t.metadata?.type === filter);

  return (
    <Page>
      <div className="px-3 pt-4 md:mx-auto md:max-w-3xl">
        <h1 className="text-[26px] font-black text-[var(--text-bright)]">History</h1>
        <p className="mt-1 text-[13px] text-[var(--text-muted)]">Deposits and withdrawals on this account.</p>

        <div className="mt-3 flex gap-1.5">
          {[
            { key: "all", label: "All" },
            { key: "deposit", label: "Deposits" },
            { key: "withdrawal", label: "Withdrawals" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="rounded-full px-3 py-1.5 text-[12px] font-bold"
              style={
                filter === f.key
                  ? { background: "var(--accent)", color: "#fff" }
                  : { background: "#fff", color: "var(--text-muted)", boxShadow: "0 1px 2px rgba(17,24,39,0.06)" }
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        {txns === null ? (
          <div className="mt-3 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-2xl bg-white opacity-70" />
            ))}
          </div>
        ) : !shown.length ? (
          <p className="mt-3 rounded-2xl bg-white p-10 text-center text-[13px] text-[var(--text-muted)] shadow-sm">
            Nothing here yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {shown.map((t) => {
              const out = t.metadata?.type === "withdrawal";
              const isPartner = t.metadata?.type === "partner_credit";
              return (
                <li
                  key={t.reference}
                  className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)]"
                    style={{ color: out ? "var(--lose)" : "var(--win)" }}
                  >
                    {isPartner ? (
                      <Handshake size={15} strokeWidth={2} />
                    ) : out ? (
                      <ArrowUpRight size={16} strokeWidth={2.2} />
                    ) : (
                      <ArrowDownLeft size={16} strokeWidth={2.2} />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold capitalize">
                      {(t.metadata?.type ?? "payment").replace("_", " ")}
                    </p>
                    <p className="text-[11px] text-[var(--text-faint)]">
                      {new Date(t.created_at).toLocaleString()} · {t.provider}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-[13px] font-bold" style={{ color: out ? "var(--lose)" : "var(--win)" }}>
                      {out ? "−" : "+"}
                      {formatMoney(Number(t.amount), t.currency)}
                    </p>
                    <p className="text-[10px] capitalize" style={{ color: TONE[t.status] ?? "var(--text-faint)" }}>
                      {t.status}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Page>
  );
}
