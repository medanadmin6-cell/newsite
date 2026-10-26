"use client";

import { Fragment, useState } from "react";
import { useAdminData, Panel, Table, Badge, money } from "@/components/admin/ui";

interface Leg {
  home_team: string;
  away_team: string;
  market: string;
  outcome: string;
  odds: number;
  result: string;
  final_home: number | null;
  final_away: number | null;
}

interface Ticket {
  id: string;
  code: string;
  stake: number;
  total_odds: number;
  potential_win: number;
  currency: string;
  status: string;
  payout: number | null;
  created_at: string;
  selections: Leg[];
  users: { id: string; name: string; phone: string };
}

const TONE: Record<string, "win" | "lose" | "pending" | "muted"> = {
  won: "win",
  lost: "lose",
  pending: "pending",
  void: "muted",
};

export default function BetsPage() {
  const [status, setStatus] = useState("all");
  const { data, error, busy } = useAdminData<{ bets: Ticket[] }>(`/api/admin/bets?status=${status}`);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {["all", "pending", "won", "lost"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className="rounded px-2.5 py-1.5 text-[12px] font-bold capitalize"
            style={
              status === s
                ? { background: "var(--accent)", color: "var(--accent-ink)" }
                : { background: "var(--surface)", color: "var(--text-muted)" }
            }
          >
            {s}
          </button>
        ))}
        <p className="ml-auto self-center text-[11px] text-[var(--text-faint)]">
          Opening this list settles every finished match first.
        </p>
      </div>

      {error && <p className="text-[13px] text-[var(--lose)]">{error}</p>}

      <Panel title={`Tickets${data ? ` (${data.bets.length})` : ""}`}>
        {busy && !data ? (
          <p className="p-6 text-[13px] text-[var(--text-muted)]">Settling and loading…</p>
        ) : (
          <Table head={["Code", "Player", "Stake", "Odds", "Return", "Status", "Placed"]}>
            {(data?.bets ?? []).map((t) => (
              <Fragment key={t.id}>
                <tr onClick={() => setOpenId(openId === t.id ? null : t.id)} className="cursor-pointer">
                  <td className="px-3 py-2 font-black tracking-wide text-[var(--accent)]">{t.code}</td>
                  <td className="px-3 py-2">
                    <p className="font-semibold">{t.users.name}</p>
                    <p className="text-[11px] text-[var(--text-faint)]">{t.users.phone}</p>
                  </td>
                  <td className="px-3 py-2">{money(t.stake, t.currency)}</td>
                  <td className="px-3 py-2 font-bold">{Number(t.total_odds).toFixed(2)}</td>
                  <td className="px-3 py-2">{money(t.payout ?? t.potential_win, t.currency)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={TONE[t.status] ?? "muted"}>{t.status}</Badge>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-[var(--text-faint)]">
                    {new Date(t.created_at).toLocaleString()}
                  </td>
                </tr>

                {openId === t.id && (
                  <tr>
                    <td colSpan={7} className="bg-[var(--surface)] px-3 py-2">
                      <ul className="space-y-1">
                        {t.selections.map((l, i) => (
                          <li key={i} className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{
                                background:
                                  l.result === "won"
                                    ? "var(--win)"
                                    : l.result === "lost"
                                      ? "var(--lose)"
                                      : "var(--pending)",
                              }}
                            />
                            <span className="font-semibold">
                              {l.home_team} v {l.away_team}
                            </span>
                            <span className="text-[var(--text-muted)]">
                              {l.market.toUpperCase()} · {l.outcome} @ {Number(l.odds).toFixed(2)}
                            </span>
                            {l.final_home != null && (
                              <span className="text-[var(--text-faint)]">
                                ended {l.final_home}-{l.final_away}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}
