"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Shell";
import { useSession } from "@/lib/store";

interface Leg {
  match_id: string;
  home_team: string;
  away_team: string;
  league?: string | null;
  market: string;
  outcome: string;
  odds: number;
  result: string;
  kickoff?: string | null;
  final_home: number | null;
  final_away: number | null;
}

interface Ticket {
  code: string;
  selections: Leg[];
}

interface Pick {
  code: string;
  market: string;
  outcome: string;
  odds: number;
  result: string;
}

interface Fixture {
  id: string;
  home: string;
  away: string;
  league: string;
  kickoff: string | null;
  finalHome: number | null;
  finalAway: number | null;
  picks: Pick[];
  open: boolean;
}

export default function MyMatchesPage() {
  const router = useRouter();
  const player = useSession((s) => s.player);
  const hydrated = useSession((s) => s.hydrated);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [view, setView] = useState<"open" | "settled">("open");

  useEffect(() => {
    if (hydrated && !player) router.replace("/login");
  }, [hydrated, player, router]);

  useEffect(() => {
    if (!player) return;
    fetch(`/api/bets/mine?userId=${player.id}`)
      .then((r) => (r.ok ? r.json() : { bets: [] }))
      .then((j) => setTickets(j.bets ?? []))
      .catch(() => setTickets([]));
  }, [player]);

  const fixtures = useMemo(() => groupFixtures(tickets ?? []), [tickets]);
  const shown = fixtures.filter((fixture) => (view === "open" ? fixture.open : !fixture.open));

  if (!player) return null;

  return (
    <Page>
      <div className="px-3 pt-3">
        <h1 className="text-[20px] font-black">My matches</h1>
        <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">Fixtures you have a pick on</p>

        <div className="mt-3 grid grid-cols-2 rounded-full bg-white p-1 shadow-sm">
          {(["open", "settled"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className="rounded-full py-2 text-[13px] font-bold"
              style={
                view === key
                  ? { background: "var(--accent)", color: "#fff" }
                  : { color: "var(--text-muted)" }
              }
            >
              {key === "open" ? "Coming up" : "Finished"}
            </button>
          ))}
        </div>

        {tickets === null ? (
          <div className="mt-3 h-36 rounded-2xl bg-white" />
        ) : shown.length === 0 ? (
          <div className="mt-3 rounded-2xl bg-white px-4 py-10 text-center shadow-sm">
            <p className="text-[14px] font-bold">No {view === "open" ? "open" : "finished"} matches</p>
            <p className="mt-1 text-[12px] text-[var(--text-muted)]">
              A match shows up here after you put it on a ticket.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-full bg-[var(--accent)] px-4 py-2 text-[13px] font-bold text-white"
            >
              Find a match
            </Link>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {shown.map((fixture) => (
              <li key={fixture.id}>
                <Link
                  href={fixture.id.startsWith("virtual-") ? "/my-bets" : `/match/${fixture.id}`}
                  className="block rounded-2xl bg-white p-3 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] font-bold text-[var(--text-muted)]">
                      {fixture.league || "Football"}
                    </p>
                    <p className="shrink-0 text-[11px] font-bold text-[var(--text-faint)]">
                      {fixture.finalHome != null && fixture.finalAway != null
                        ? `${fixture.finalHome} - ${fixture.finalAway}`
                        : kickoffLabel(fixture.kickoff)}
                    </p>
                  </div>
                  <p className="mt-2 text-[15px] font-black leading-tight">{fixture.home}</p>
                  <p className="text-[15px] font-black leading-tight text-[var(--text-muted)]">{fixture.away}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {fixture.picks.map((pick, index) => (
                      <span
                        key={`${pick.code}-${index}`}
                        className="rounded-full px-2 py-1 text-[11px] font-bold"
                        style={{
                          background:
                            pick.result === "won"
                              ? "#ecfdf3"
                              : pick.result === "lost"
                                ? "#fff1f2"
                                : "#e7efff",
                          color:
                            pick.result === "won"
                              ? "var(--win)"
                              : pick.result === "lost"
                                ? "var(--lose)"
                                : "var(--accent)",
                        }}
                      >
                        {pick.outcome} · {Number(pick.odds).toFixed(2)}
                      </span>
                    ))}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Page>
  );
}

function groupFixtures(tickets: Ticket[]): Fixture[] {
  const byId = new Map<string, Fixture>();
  for (const ticket of tickets) {
    for (const leg of ticket.selections) {
      const current = byId.get(leg.match_id) ?? {
        id: leg.match_id,
        home: leg.home_team,
        away: leg.away_team,
        league: leg.league ?? "",
        kickoff: leg.kickoff ?? null,
        finalHome: leg.final_home,
        finalAway: leg.final_away,
        picks: [],
        open: false,
      };
      current.picks.push({
        code: ticket.code,
        market: leg.market,
        outcome: leg.outcome,
        odds: leg.odds,
        result: leg.result,
      });
      if (leg.result === "pending" || !leg.result) current.open = true;
      if (leg.final_home != null) current.finalHome = leg.final_home;
      if (leg.final_away != null) current.finalAway = leg.final_away;
      byId.set(leg.match_id, current);
    }
  }
  return [...byId.values()].sort((a, b) => {
    const at = a.kickoff ? new Date(a.kickoff).getTime() : 0;
    const bt = b.kickoff ? new Date(b.kickoff).getTime() : 0;
    return bt - at;
  });
}

function kickoffLabel(iso: string | null) {
  if (!iso) return "Scheduled";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Scheduled";
  return date.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
