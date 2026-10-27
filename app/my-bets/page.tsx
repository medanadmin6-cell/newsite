"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Shell";
import { useSession } from "@/lib/store";
import { formatMoney } from "@/lib/countries";
import { WinCelebration, hasCelebrated, markCelebrated } from "@/components/WinCelebration";

interface Leg {
  match_id: string;
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
  settled_at: string | null;
  created_at: string;
  selections: Leg[];
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string; rail: string }> = {
  pending: { bg: "var(--accent-soft)", fg: "var(--accent-dim)", label: "Open", rail: "var(--accent)" },
  won: { bg: "#ecfdf3", fg: "var(--win-2)", label: "Won", rail: "var(--win)" },
  lost: { bg: "var(--lose-bg)", fg: "var(--lose)", label: "Lost", rail: "var(--lose)" },
  cashed_out: { bg: "#fff7e6", fg: "#9a6700", label: "Cashed out", rail: "var(--pending)" },
  void: { bg: "var(--surface-2)", fg: "var(--text-muted)", label: "Void", rail: "var(--line)" },
};

export default function MyBetsPage() {
  const router = useRouter();
  const player = useSession((s) => s.player);
  const hydrated = useSession((s) => s.hydrated);
  const setOpenBets = useSession((s) => s.setOpenBets);

  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [filter, setFilter] = useState("all");
  // The first winning ticket the player has not been shown yet.
  const [celebrating, setCelebrating] = useState<Ticket | null>(null);

  useEffect(() => {
    if (hydrated && !player) router.replace("/login");
  }, [hydrated, player, router]);

  useEffect(() => {
    if (!player) return;
    // Opening this screen settles this player's own tickets first.
    fetch(`/api/bets/mine?userId=${player.id}`)
      .then((r) => (r.ok ? r.json() : { bets: [] }))
      .then((j) => {
        const bets: Ticket[] = j.bets ?? [];
        setTickets(bets);

        // This response is the freshest count there is — settlement ran on the
        // way in — so it corrects the tab badge without waiting for the next
        // balance poll to notice the tickets that just closed.
        if (typeof j.openBets === "number") setOpenBets(j.openBets);

        // Announce a win once. Opening this screen is the moment the player
        // finds out, and settlement has already run by the time it responds.
        const fresh = bets.find((b) => b.status === "won" && !hasCelebrated(b.code));
        if (fresh && markCelebrated(fresh.code)) setCelebrating(fresh);
      })
      .catch(() => setTickets([]));
  }, [player, setOpenBets]);

  if (!player) return null;

  const shown = tickets?.filter((t) => filter === "all" || t.status === filter) ?? null;
  const openCount = tickets?.filter((t) => t.status === "pending").length ?? 0;
  const wonCount = tickets?.filter((t) => t.status === "won").length ?? 0;
  const staked = tickets?.reduce((sum, t) => sum + Number(t.stake), 0) ?? 0;

  return (
    <Page>
      <div className="px-3 pb-6 pt-3">
        <h1 className="text-[22px] font-black text-[var(--text-bright)]">My bets</h1>
        <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
          {tickets ? "Your tickets, settled on this account" : "Loading your tickets"}
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label="Open" value={tickets ? String(openCount) : "—"} tone="blue" />
          <Stat label="Won" value={tickets ? String(wonCount) : "—"} tone="green" />
          <Stat label="Staked" value={tickets ? formatMoney(staked, player.currency) : "—"} tone="gold" />
        </div>

        <div className="scroll-x mt-3 flex gap-1.5">
          {["all", "pending", "won", "lost", "cashed_out"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold capitalize"
              style={
                filter === f
                  ? { background: "var(--accent)", color: "#fff" }
                  : { background: "#fff", color: "var(--text-muted)", boxShadow: "0 1px 2px rgba(17,24,39,0.06)" }
              }
            >
              {f === "pending" ? "Open" : f === "cashed_out" ? "Cashed out" : f}
            </button>
          ))}
        </div>

        {shown === null ? (
          <div className="mt-3 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 rounded-2xl bg-white opacity-70" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-white p-10 text-center text-[13px] text-[var(--text-muted)] shadow-sm">
            No tickets here yet.
          </p>
        ) : (
          shown.map((t) => <TicketCard key={t.id} ticket={t} onCelebrate={setCelebrating} />)
        )}
      </div>

      {celebrating && (
        <WinCelebration
          code={celebrating.code}
          amount={Number(celebrating.payout ?? celebrating.potential_win)}
          currency={celebrating.currency}
          onClose={() => setCelebrating(null)}
        />
      )}
    </Page>
  );
}

/**
 * A won ticket is worth stopping on. Tapping one raises the celebration —
 * the cup, the amount, the code — and the modal's own Details button carries
 * on to the ticket. Every other status goes straight there, since there is
 * nothing to celebrate on the way.
 */
function CardShell({
  ticket,
  onCelebrate,
  children,
}: {
  ticket: Ticket;
  onCelebrate: (t: Ticket) => void;
  children: React.ReactNode;
}) {
  if (ticket.status === "won") {
    return (
      <button
        onClick={() => onCelebrate(ticket)}
        className="block w-full px-4 py-3 text-left"
        aria-label={`You won on ticket ${ticket.code}`}
      >
        {children}
      </button>
    );
  }
  return (
    <Link href={`/my-bets/${ticket.code}`} className="block w-full px-4 py-3 text-left">
      {children}
    </Link>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "blue" | "green" | "gold" }) {
  const ink = tone === "blue" ? "var(--accent)" : tone === "green" ? "var(--win)" : "var(--price)";
  const wash = tone === "blue" ? "var(--accent-soft)" : tone === "green" ? "#ecfdf3" : "#fff7e6";
  return (
    <div className="rounded-2xl px-3 py-2.5" style={{ background: wash }}>
      <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: ink }}>
        {label}
      </p>
      <p className="mt-0.5 truncate text-[14px] font-black text-[var(--text-bright)]">{value}</p>
    </div>
  );
}

function TicketCard({ ticket, onCelebrate }: { ticket: Ticket; onCelebrate: (t: Ticket) => void }) {
  const [open, setOpen] = useState(false);
  const style = STATUS_STYLE[ticket.status] ?? STATUS_STYLE.pending;

  return (
    <article className="mt-3 overflow-hidden rounded-2xl bg-white text-[var(--text)] shadow-sm">
      <div className="h-1" style={{ background: style.rail }} />
      <CardShell ticket={ticket} onCelebrate={onCelebrate}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[13px] font-black tracking-wider text-[var(--accent-dim)]">{ticket.code}</p>
            <p className="truncate text-[12px] font-semibold text-[var(--text-muted)]">
              {ticket.selections[0]
                ? `${ticket.selections[0].home_team} v ${ticket.selections[0].away_team}`
                : "Ticket"}
              {ticket.selections.length > 1 ? ` +${ticket.selections.length - 1}` : ""}
            </p>
          </div>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase"
            style={{ background: style.bg, color: style.fg }}
          >
            {style.label}
          </span>
        </div>

        <dl className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
          <div className="rounded-xl bg-[var(--surface-2)] px-2 py-1.5">
            <dt className="text-[10px] text-[var(--text-faint)]">Stake</dt>
            <dd className="font-bold">{formatMoney(Number(ticket.stake), ticket.currency)}</dd>
          </div>
          <div className="rounded-xl bg-[#fff7e6] px-2 py-1.5">
            <dt className="text-[10px] text-[var(--text-faint)]">Odds</dt>
            <dd className="font-bold text-[var(--price)]">{Number(ticket.total_odds).toFixed(2)}</dd>
          </div>
          <div className="rounded-xl px-2 py-1.5" style={{ background: style.bg }}>
            <dt className="text-[10px] text-[var(--text-faint)]">
              {ticket.status === "won" ? "Paid" : "Return"}
            </dt>
            <dd className="font-bold" style={{ color: style.fg }}>
              {formatMoney(Number(ticket.payout ?? ticket.potential_win), ticket.currency)}
            </dd>
          </div>
        </dl>
      </CardShell>

      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full border-t border-[var(--line)] py-2 text-[11px] font-semibold text-[var(--accent)]"
      >
        {open ? "Hide legs" : `Show ${ticket.selections.length} leg${ticket.selections.length === 1 ? "" : "s"}`}
      </button>

      {open && (
        <ul className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
          {ticket.selections.map((leg, i) => (
            <li key={i} className="flex items-center gap-2 px-4 py-2.5">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  background:
                    leg.result === "won"
                      ? "var(--win)"
                      : leg.result === "lost"
                        ? "var(--lose)"
                        : "var(--pending)",
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold">
                  {leg.home_team} v {leg.away_team}
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {leg.market.toUpperCase()} · {leg.outcome}
                  {leg.final_home != null && leg.final_away != null && (
                    <span className="ml-1 text-[var(--text-faint)]">
                      (ended {leg.final_home}-{leg.final_away})
                    </span>
                  )}
                </p>
              </div>
              <span className="text-[12px] font-bold text-[var(--price)]">{Number(leg.odds).toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
