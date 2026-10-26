"use client";

import { useState } from "react";
import { useAdminData, adminAction, Panel, Table, Badge, Button, money } from "@/components/admin/ui";

interface Payment {
  reference: string;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  metadata: { type?: string; payout_number?: string; payout_bank?: string; awaiting_approval?: boolean };
  created_at: string;
  resolved_at: string | null;
  users: { id: string; name: string; phone: string };
}

const TONE: Record<string, "win" | "lose" | "pending" | "muted"> = {
  confirmed: "win",
  resolved: "win",
  failed: "lose",
  pending: "pending",
};

export default function PaymentsPage() {
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const { data, error, reload, busy } = useAdminData<{ payments: Payment[] }>(
    `/api/admin/payments?type=${type}&status=${status}`,
  );
  const [note, setNote] = useState<string | null>(null);

  const resolve = async (reference: string) => {
    const res = await adminAction("/api/admin/payments", "PATCH", { reference, status: "resolved" });
    setNote(res.ok ? "Marked resolved." : (res.error ?? "Failed"));
    if (res.ok) reload();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {[
          { label: "Type", value: type, set: setType, options: ["all", "deposit", "withdrawal"] },
          { label: "Status", value: status, set: setStatus, options: ["all", "pending", "confirmed", "resolved", "failed"] },
        ].map((group) => (
          <div key={group.label} className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-[var(--text-faint)]">{group.label}</span>
            {group.options.map((o) => (
              <button
                key={o}
                onClick={() => group.set(o)}
                className="rounded px-2 py-1 text-[11px] font-bold capitalize"
                style={
                  group.value === o
                    ? { background: "var(--accent)", color: "var(--accent-ink)" }
                    : { background: "var(--surface)", color: "var(--text-muted)" }
                }
              >
                {o}
              </button>
            ))}
          </div>
        ))}
      </div>

      {note && <p className="text-[12px] text-[var(--text-muted)]">{note}</p>}
      {error && <p className="text-[13px] text-[var(--lose)]">{error}</p>}

      <Panel title={`Ledger${data ? ` (${data.payments.length})` : ""}`}>
        {busy && !data ? (
          <p className="p-6 text-[13px] text-[var(--text-muted)]">Loading…</p>
        ) : (
          <Table head={["Reference", "Player", "Type", "Amount", "Rail", "Payout to", "Status", ""]}>
            {(data?.payments ?? []).map((p) => (
              <tr key={p.reference}>
                <td className="px-3 py-2 font-mono text-[10px] text-[var(--text-faint)]">{p.reference}</td>
                <td className="px-3 py-2">
                  <p className="font-semibold">{p.users.name}</p>
                  <p className="text-[11px] text-[var(--text-faint)]">{p.users.phone}</p>
                </td>
                <td className="px-3 py-2 capitalize">{p.metadata?.type ?? "—"}</td>
                <td className="px-3 py-2 font-bold">{money(p.amount, p.currency)}</td>
                <td className="px-3 py-2 text-[var(--text-muted)]">{p.provider}</td>
                <td className="px-3 py-2 text-[11px] text-[var(--text-muted)]">
                  {p.metadata?.payout_number ?? "—"}
                  {p.metadata?.payout_bank ? ` · ${p.metadata.payout_bank}` : ""}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={TONE[p.status] ?? "muted"}>{p.status}</Badge>
                  {p.metadata?.awaiting_approval && (
                    <span className="ml-1 text-[10px] text-[var(--pending)]">needs approval</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {p.metadata?.type === "withdrawal" && p.status === "pending" && (
                    <Button tone="accent" onClick={() => resolve(p.reference)}>
                      Mark paid
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}
