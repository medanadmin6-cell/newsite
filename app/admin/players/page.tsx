"use client";

import { useState } from "react";
import { useAdminData, adminAction, Panel, Table, Badge, Button, money } from "@/components/admin/ui";
import { useDialog, validators } from "@/components/admin/Dialog";

interface Player {
  id: string;
  name: string;
  phone: string;
  country_code: string;
  currency: string;
  balance: number;
  total_deposited: number;
  verification_step: number;
  withdrawal_approved: boolean;
  payout_number: string | null;
  gate: { progress: { have: number; need: number; label: string }; qualifies: boolean; unlocked: boolean };
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "depositors", label: "Depositors" },
  { key: "awaiting", label: "Awaiting approval" },
  { key: "approved", label: "Approved" },
  { key: "unverified", label: "Unverified" },
];

export default function PlayersPage() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const query = `/api/admin/players?filter=${filter}${search ? `&q=${encodeURIComponent(search)}` : ""}`;
  const { data, error, reload, busy } = useAdminData<{ players: Player[] }>(query);
  const [note, setNote] = useState<string | null>(null);
  const { ask, dialog } = useDialog();

  const act = async (userId: string, action: string, amount?: number) => {
    const res = await adminAction("/api/admin/players", "PATCH", { userId, action, amount });
    setNote(res.ok ? "Done." : (res.error ?? "Failed"));
    if (res.ok) reload();
  };

  const credit = async (player: Player) => {
    const values = await ask({
      title: `Adjust ${player.name}'s wallet`,
      description:
        `Balance is ${money(player.balance, player.currency)}. This is a correction, not a deposit: ` +
        "it skips the welcome bonus, referral commission and the withdrawal gate.",
      fields: [
        {
          name: "amount",
          label: `Amount (${player.currency})`,
          placeholder: "50",
          hint: "Negative to debit.",
          validate: validators.money,
        },
      ],
      confirmLabel: "Adjust",
    });
    if (!values) return;
    await act(player.id, "credit", Number(values.amount));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className="rounded px-2.5 py-1.5 text-[12px] font-bold"
            style={
              filter === f.key
                ? { background: "var(--accent)", color: "var(--accent-ink)" }
                : { background: "var(--surface)", color: "var(--text-muted)" }
            }
          >
            {f.label}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, phone or email"
          className="ml-auto w-56 rounded bg-[var(--surface-2)] px-3 py-1.5 text-[12px] outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
      </div>

      {note && <p className="text-[12px] text-[var(--text-muted)]">{note}</p>}
      {error && <p className="text-[13px] text-[var(--lose)]">{error}</p>}

      <Panel title={`Players${data ? ` (${data.players.length})` : ""}`}>
        {busy && !data ? (
          <p className="p-6 text-[13px] text-[var(--text-muted)]">Loading…</p>
        ) : (
          <Table head={["Player", "Balance", "Deposited", "Withdrawal gate", "Status", "Actions"]}>
            {(data?.players ?? []).map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-[11px] text-[var(--text-faint)]">
                    {p.phone} · {p.country_code}
                  </p>
                </td>
                <td className="px-3 py-2 font-bold">{money(p.balance, p.currency)}</td>
                <td className="px-3 py-2">{money(p.total_deposited, p.currency)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-16 overflow-hidden rounded-full bg-[var(--surface-2)]">
                      <div
                        className="h-full bg-[var(--accent)]"
                        style={{
                          width: `${Math.min(100, (p.gate.progress.have / p.gate.progress.need) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-[11px] text-[var(--text-muted)]">{p.gate.progress.label}</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  {p.withdrawal_approved ? (
                    <Badge tone="win">Approved</Badge>
                  ) : p.gate.qualifies ? (
                    <Badge tone="pending">Qualifies</Badge>
                  ) : (
                    <Badge tone="muted">Locked</Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1.5">
                    <Button onClick={() => credit(p)}>Credit</Button>
                    {p.withdrawal_approved ? (
                      <Button tone="danger" onClick={() => act(p.id, "revoke")}>
                        Revoke
                      </Button>
                    ) : (
                      // Never offered to a player the withdrawal endpoint would
                      // still block: both read the same gate module.
                      <Button tone="accent" disabled={!p.gate.qualifies} onClick={() => act(p.id, "approve")}>
                        Approve
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
      {dialog}
    </div>
  );
}
