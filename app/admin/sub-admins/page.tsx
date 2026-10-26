"use client";

import { useState } from "react";
import { useAdminData, adminAction, Panel, Table, Badge, Button, money } from "@/components/admin/ui";

interface Partner {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  referral_code: string;
  approved: boolean;
  balances: Record<string, number>;
  lifetime: Record<string, number>;
  payout_name: string | null;
  payout_network: string | null;
  payout_number: string | null;
  referredPlayers: number;
  today: Record<string, number>;
}

export default function SubAdminsPage() {
  const { data, error, reload, busy } = useAdminData<{ partners: Partner[] }>("/api/admin/sub-admins");
  const [note, setNote] = useState<string | null>(null);

  const act = async (id: string, action: string, currency?: string) => {
    const res = await adminAction("/api/admin/sub-admins", "PATCH", { id, action, currency });
    if (res.ok && action === "settle") {
      setNote(`Settled ${currency} ${Number(res.data?.settled ?? 0).toFixed(2)}.`);
    } else {
      setNote(res.ok ? "Done." : (res.error ?? "Failed"));
    }
    if (res.ok) reload();
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-[var(--text-faint)]">
        An unapproved partner can sign in but earns nothing — commission is skipped, with the reason
        logged, for every deposit they refer.
      </p>

      {note && <p className="text-[12px] text-[var(--text-muted)]">{note}</p>}
      {error && <p className="text-[13px] text-[var(--lose)]">{error}</p>}

      <Panel title={`Partners${data ? ` (${data.partners.length})` : ""}`}>
        {busy && !data ? (
          <p className="p-6 text-[13px] text-[var(--text-muted)]">Loading…</p>
        ) : (
          <Table head={["Partner", "Code", "Players", "Today", "Owed", "Lifetime", "Pay to", "Actions"]}>
            {(data?.partners ?? []).map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-[11px] text-[var(--text-faint)]">
                    {p.email}
                    {p.phone ? ` · ${p.phone}` : ""}
                  </p>
                </td>
                <td className="px-3 py-2">
                  <span className="font-mono text-[12px] font-bold text-[var(--accent)]">
                    {p.referral_code}
                  </span>
                </td>
                <td className="px-3 py-2 font-bold">{p.referredPlayers}</td>
                <td className="px-3 py-2 font-bold text-[var(--accent)]">
                  <Balances totals={p.today} />
                </td>
                <td className="px-3 py-2">
                  <Balances totals={p.balances} />
                </td>
                <td className="px-3 py-2 text-[var(--text-muted)]">
                  <Balances totals={p.lifetime} />
                </td>
                <td className="px-3 py-2 text-[11px] text-[var(--text-muted)]">
                  {p.payout_number ? (
                    <>
                      <p>{p.payout_name ?? "—"}</p>
                      <p className="text-[var(--text-faint)]">
                        {p.payout_network ?? ""} {p.payout_number}
                      </p>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {p.approved ? (
                      <Button tone="danger" onClick={() => act(p.id, "revoke")}>
                        Revoke
                      </Button>
                    ) : (
                      <Button tone="accent" onClick={() => act(p.id, "approve")}>
                        Approve
                      </Button>
                    )}
                    {Object.entries(p.balances ?? {})
                      .filter(([, amount]) => amount > 0)
                      .map(([currency]) => (
                        <Button key={currency} onClick={() => act(p.id, "settle", currency)}>
                          Settle {currency}
                        </Button>
                      ))}
                    {!p.approved && <Badge tone="muted">Earning nothing</Badge>}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}

function Balances({ totals }: { totals: Record<string, number> }) {
  const entries = Object.entries(totals ?? {}).filter(([, v]) => v);
  if (!entries.length) return <span className="text-[var(--text-faint)]">—</span>;
  return (
    <div className="space-y-0.5">
      {entries.map(([currency, amount]) => (
        <p key={currency} className="font-bold">
          {money(amount, currency)}
        </p>
      ))}
    </div>
  );
}
