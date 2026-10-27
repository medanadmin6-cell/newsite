"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  Check,
  ChevronsDown,
  IdCard,
  Trophy,
  CircleCheck,
  CircleX,
  Share2,
  LineChart,
} from "lucide-react";
import { useSlip, useSession, type SlipLeg } from "@/lib/store";
import { formatMoney } from "@/lib/countries";
import { marketName } from "@/lib/markets";

/**
 * One ticket in full.
 *
 * The status rail down the side of each leg is the point of the layout: a
 * ten-leg ticket is scannable at a glance because every leg says where it
 * stands without the reader having to compare numbers.
 */

interface Leg {
  id: string;
  match_id: string;
  home_team: string;
  away_team: string;
  league: string | null;
  sport: string;
  kickoff: string | null;
  market: string;
  outcome: string;
  odds: number;
  result: string;
  final_home: number | null;
  final_away: number | null;
  currentOdds?: number | null;
  isLive?: boolean;
  liveHome?: number | null;
  liveAway?: number | null;
  minuteLabel?: string | null;
}

interface Bet {
  code: string;
  stake: number;
  total_odds: number;
  potential_win: number;
  bonus: number;
  currency: string;
  status: string;
  payout: number | null;
  mode: string;
  cashout_amount: number | null;
  created_at: string;
}

interface Payload {
  bet: Bet;
  owner: { name: string | null };
  selections: Leg[];
  cashout: { available: boolean; amount: number; potential: number; reason?: string };
}

const STATUS: Record<string, { label: string; colour: string }> = {
  pending: { label: "NOT STARTED", colour: "var(--text-muted)" },
  won: { label: "WON", colour: "var(--win)" },
  lost: { label: "LOST", colour: "var(--lose)" },
  cashed_out: { label: "CASHED OUT", colour: "var(--pending)" },
  void: { label: "VOID", colour: "var(--text-muted)" },
};

export function TicketDetail({ code }: { code: string }) {
  const router = useRouter();
  const player = useSession((s) => s.player);
  const hydrated = useSession((s) => s.hydrated);
  const setBalance = useSession((s) => s.setBalance);
  const load = useSlip((s) => s.load);

  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [shared, setShared] = useState(false);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (hydrated && !player) router.replace("/login");
  }, [hydrated, player, router]);

  useEffect(() => {
    if (!player) return;
    let alive = true;

    (async () => {
      try {
        const res = await fetch(`/api/bets/${code}?userId=${player.id}`, { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setError(json.error ?? "Could not load this ticket");
          return;
        }
        setData(json);
        setError(null);
      } catch {
        if (alive) setError("Could not load this ticket");
      }
    })();

    return () => {
      alive = false;
    };
  }, [player, code, nonce]);

  // While anything on the ticket is still running, keep the score and the
  // cashout offer current. Both move on their own, and a stale number on
  // either is worse than none.
  useEffect(() => {
    if (data?.bet.status !== "pending") return;
    const timer = setInterval(reload, 30_000);
    return () => clearInterval(timer);
  }, [data?.bet.status, reload]);

  const cashout = async () => {
    if (!player || !data?.cashout.available) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/bets/${code}/cashout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: player.id, expected: data.cashout.amount }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNote(json.error ?? "Could not cash out");
        if (json.moved) reload();
        return;
      }
      setNote(`Cashed out for ${formatMoney(json.amount, data.bet.currency)}.`);
      if (typeof json.balance === "number") setBalance(json.balance);
      reload();
    } catch {
      setNote("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  /** Share the win, falling back to the clipboard where there is no share sheet. */
  const showOff = async () => {
    if (!data) return;
    const amount = formatMoney(Number(data.bet.payout ?? 0), data.bet.currency);
    const text = `I just won ${amount} on Velora. Ticket ${data.bet.code}.`;
    const url = typeof window !== "undefined" ? window.location.origin : "";

    if (navigator.share) {
      try {
        await navigator.share({ title: "Velora win", text, url });
        return;
      } catch {
        /* dismissed */
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setShared(true);
      setTimeout(() => setShared(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  /** Put the same selections back on the slip. */
  const rebet = () => {
    if (!data) return;
    const legs: SlipLeg[] = data.selections.map((l) => ({
      matchId: l.match_id,
      homeTeam: l.home_team,
      awayTeam: l.away_team,
      league: l.league ?? "",
      kickoff: l.kickoff ?? "",
      market: l.market,
      marketLabel: marketName(l.market),
      outcome: l.outcome,
      outcomeLabel: l.outcome,
      odds: Number(l.odds),
    }));
    load(legs);
    router.push("/");
  };

  const book = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: player?.id ?? null,
          expiresInHours: 48,
          selections: data.selections.map((l) => ({
            matchId: l.match_id,
            homeTeam: l.home_team,
            awayTeam: l.away_team,
            league: l.league ?? "",
            kickoff: l.kickoff ?? "",
            market: l.market,
            marketLabel: marketName(l.market),
            outcome: l.outcome,
            outcomeLabel: l.outcome,
            odds: Number(l.odds),
          })),
        }),
      });
      const json = await res.json();
      setNote(res.ok ? `Booking code ${json.code}` : (json.error ?? "Could not book"));
    } catch {
      setNote("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!player) return null;

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <Header onBack={() => router.back()} />
        <div className="p-10 text-center">
          <p className="text-[14px] text-[var(--text-muted)]">{error}</p>
          <Link
            href="/my-bets"
            className="mt-4 inline-block rounded bg-[var(--accent)] px-5 py-2.5 text-[13px] font-black text-[var(--accent-ink)]"
          >
            Back to my bets
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <Header onBack={() => router.back()} />
        <div className="animate-pulse space-y-3 p-4">
          <div className="h-40 rounded bg-[var(--bg-elevated)]" />
          <div className="h-32 rounded bg-[var(--bg-elevated)]" />
        </div>
      </div>
    );
  }

  const { bet, selections, cashout: offer } = data;
  const status = STATUS[bet.status] ?? STATUS.pending;
  const settled = bet.status !== "pending";
  const won = bet.status === "won" || bet.status === "cashed_out";

  return (
    <div className="min-h-screen bg-[var(--bg)] pb-24">
      <Header onBack={() => router.back()} />

      {/* Summary */}
      <section className="mx-3 mt-3 rounded-3xl bg-white px-4 pb-5 pt-4 shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-2 text-[12px] text-[var(--text-muted)]">
          <span>
            {new Date(bet.created_at).toLocaleString("en-GB", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <span className="capitalize text-[var(--text)]">{bet.mode}</span>
          <span className="ml-auto">Ticket ID: {bet.code}</span>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(bet.code).then(
                () => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                },
                () => setCopied(false),
              );
            }}
            className="flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-medium text-[var(--text)]"
          >
            {copied ? <Check size={12} strokeWidth={2.6} /> : <Copy size={12} strokeWidth={2} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="mx-auto mt-3 flex max-w-2xl items-center justify-between">
          <span className="text-[17px] font-bold capitalize text-[var(--text-bright)]">
            {bet.mode}
          </span>
          <span className="flex items-center gap-1.5" style={{ color: status.colour }}>
            {won && <Trophy size={17} strokeWidth={2} />}
            <span className="text-[17px] font-black">{status.label}</span>
          </span>
        </div>

        {/* The return is the number a settled ticket is really about. */}
        <div className="mx-auto mt-2 max-w-2xl">
          <p className="text-[13px] text-[var(--text-muted)]">
            {settled ? "Total Return" : "Potential Return"}
          </p>
          <p
            className="text-[27px] font-black leading-tight"
            style={{ color: won ? "var(--win)" : "var(--text-bright)" }}
          >
            {formatMoney(
              settled ? Number(bet.payout ?? 0) : Number(bet.potential_win),
              bet.currency,
            )}
          </p>
        </div>

        <dl className="mx-auto mt-3 max-w-2xl space-y-1.5 border-t border-[var(--line)] pt-3 text-[14px]">
          <Line label="Total Stake" value={Number(bet.stake).toFixed(2)} />
          <Line label="Total Odds" value={Number(bet.total_odds).toFixed(2)} />
          {Number(bet.bonus) > 0 && (
            <Line label="Max. Bonus" value={Number(bet.bonus).toFixed(2)} accent />
          )}
          {!settled && <Line label="To Return" value={Number(bet.potential_win).toFixed(2)} />}
        </dl>

        {/* Congratulations, on a won ticket only. */}
        {won && (
          <div className="mx-auto mt-4 flex max-w-2xl items-center gap-3 rounded-2xl bg-[#ecfdf3] px-3 py-2.5">
            <Confetti />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-black leading-tight text-[var(--text-bright)]">
                Congratulations!
              </span>
              <span className="block truncate text-[13px] font-medium text-[var(--accent)]">
                {data.owner?.name ?? player.name}
              </span>
            </span>
            <button
              onClick={showOff}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2.5 text-[13px] font-black text-white"
            >
              {shared ? <Check size={14} strokeWidth={2.6} /> : <Share2 size={14} strokeWidth={2.2} />}
              {shared ? "Copied" : "Show Off"}
            </button>
          </div>
        )}

        <div className="mt-4 flex justify-center">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-6 py-2.5 text-[14px] font-bold text-[var(--accent-ink)]"
          >
            {expanded ? "Hide Details" : "Check Details"}
            <ChevronsDown
              size={16}
              strokeWidth={2.4}
              style={{ transform: expanded ? "rotate(180deg)" : undefined }}
            />
          </button>
        </div>
      </section>

      <div className="mx-auto max-w-2xl border-t border-dashed border-[var(--line)]" />

      {/* Legs */}
      {expanded && (
        <div className="mx-auto max-w-2xl space-y-3 p-3">
          {selections.map((leg) => (
            <LegCard key={leg.id} leg={leg} />
          ))}
        </div>
      )}

      {note && (
        <p className="mx-auto max-w-2xl px-4 text-center text-[12px] text-[var(--text-muted)]">{note}</p>
      )}

      {!offer.available && offer.reason && bet.status === "pending" && (
        <p className="mx-auto max-w-2xl px-4 pt-2 text-center text-[11px] text-[var(--text-faint)]">
          {reasonText(offer.reason)}
        </p>
      )}

      {/* Actions */}
      <div className="fixed inset-x-0 bottom-0 border-t border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-2xl gap-2">
          <button
            onClick={book}
            disabled={busy}
            className="flex-1 rounded-full py-2.5 text-[13px] font-bold text-[var(--accent)] ring-1 ring-[var(--accent)] disabled:opacity-40"
          >
            Booking Code
          </button>
          <button
            onClick={rebet}
            className="flex-1 rounded-full py-2.5 text-[13px] font-bold text-[var(--accent)] ring-1 ring-[var(--accent)]"
          >
            Rebet
          </button>
          <button
            onClick={cashout}
            disabled={busy || !offer.available}
            className="flex-1 rounded-full py-2.5 text-[13px] font-black text-[var(--accent-ink)] disabled:opacity-30"
            style={{ background: "var(--accent)" }}
          >
            {offer.available
              ? `Cash Out ${formatMoney(offer.amount, bet.currency)}`
              : "Cash Out"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The result of a leg in words, for the markets a final score can settle
 * unambiguously. Anything else returns null rather than a guess.
 */
function describeOutcome(leg: Leg): string | null {
  if (leg.final_home === null || leg.final_away === null) return null;

  const h = leg.final_home;
  const a = leg.final_away;
  const market = leg.market.toLowerCase();

  if (market === "1x2" || market === "af1") {
    return h > a ? "Home" : h < a ? "Away" : "Draw";
  }
  if (market === "af8" || market === "btts") {
    return h > 0 && a > 0 ? "Yes" : "No";
  }
  if (market === "af5" || market === "af50" || market.startsWith("ou")) {
    return `${h + a} goals`;
  }
  if (market === "af21" || market === "oe") {
    return (h + a) % 2 === 1 ? "Odd" : "Even";
  }
  if (market === "af10" || market === "cs" || market === "eg") {
    return `${h}:${a}`;
  }
  return null;
}

/** The burst beside the congratulations line. */
function Confetti() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="17" cy="20" r="10" fill="#FABD2E" />
      <circle cx="17" cy="20" r="10" fill="none" stroke="#D89A12" strokeWidth="1.5" />
      <path
        d="M14.6 16.4h5c1.9 0 3 .9 3 2.4 0 1-.6 1.8-1.5 2.1 1.2.3 1.9 1.1 1.9 2.3 0 1.7-1.3 2.7-3.4 2.7h-5v-9.5z"
        fill="#3F2D03"
      />
      <g stroke="#93C738" strokeWidth="2" strokeLinecap="round">
        <path d="M30 9l4-4M31 17l5-1" />
      </g>
      <g stroke="#FF5252" strokeWidth="2" strokeLinecap="round">
        <path d="M29 27l5 4M8 8l-4-3" />
      </g>
      <g stroke="#259CA7" strokeWidth="2" strokeLinecap="round">
        <path d="M6 30l-3 4M35 24l3 3" />
      </g>
      <circle cx="33" cy="12" r="1.6" fill="#FFFFFF" />
      <circle cx="5" cy="18" r="1.4" fill="#93C738" />
    </svg>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <header className="sticky top-0 z-40 bg-[#0f1c33]">
      <div className="mx-auto flex h-[52px] max-w-2xl items-center gap-3 px-4">
        <button onClick={onBack} aria-label="Back" className="text-white">
          <ArrowLeft size={22} strokeWidth={2} />
        </button>
        <h1 className="flex-1 text-[17px] font-black text-white">Bet details</h1>
      </div>
    </header>
  );
}

function Line({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="font-bold" style={accent ? { color: "var(--accent)" } : undefined}>
        {value}
      </dd>
    </div>
  );
}

function LegCard({ leg }: { leg: Leg }) {
  const state =
    leg.result === "won"
      ? { label: "WON", colour: "var(--win)" }
      : leg.result === "lost"
        ? { label: "LOST", colour: "var(--lose)" }
        : leg.isLive
          ? { label: "LIVE", colour: "var(--live)" }
          : { label: "NOT STARTED", colour: "var(--text-faint)" };

  // A settled leg keeps the score it was judged on; an open one shows the
  // score right now, which is the whole reason to open a ticket mid-match.
  const settledScore = leg.final_home !== null && leg.final_away !== null;
  const homeScore = settledScore ? leg.final_home : (leg.liveHome ?? null);
  const awayScore = settledScore ? leg.final_away : (leg.liveAway ?? null);
  const showingLive = !settledScore && leg.liveHome !== null && leg.liveHome !== undefined;

  // What actually happened, where the final score says so plainly. Left blank
  // for markets whose result cannot be read off the scoreline alone — an
  // invented "Outcome" would be worse than none.
  const outcome = describeOutcome(leg);

  const drift =
    leg.currentOdds && Math.abs(leg.currentOdds - Number(leg.odds)) > 0.005
      ? leg.currentOdds < Number(leg.odds)
        ? "shortened"
        : "drifted"
      : null;

  return (
    <article className="flex overflow-hidden rounded-2xl bg-white shadow-sm">
      {/* Status mark: a settled leg says at a glance whether it landed. */}
      <div
        className="flex w-9 shrink-0 items-start justify-center pt-3"
        style={{ background: "var(--surface)", color: state.colour }}
      >
        {leg.result === "won" ? (
          <CircleCheck size={19} strokeWidth={2.2} />
        ) : leg.result === "lost" ? (
          <CircleX size={19} strokeWidth={2.2} />
        ) : (
          <span className="h-2 w-2 rounded-full" style={{ background: state.colour }} />
        )}
      </div>

      <div className="min-w-0 flex-1 p-3">
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
          <span>
            {leg.kickoff
              ? new Date(leg.kickoff).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </span>
          <span className="capitalize underline decoration-[var(--text-faint)]">{leg.sport}</span>
          {leg.minuteLabel && (
            <span className="font-bold text-[var(--live)]">{leg.minuteLabel}</span>
          )}
          <span
            className="ml-auto rounded px-1.5 py-0.5 text-[9px] font-black"
            style={{ color: state.colour, boxShadow: `inset 0 0 0 1px ${state.colour}` }}
          >
            {leg.isLive ? "LIVE" : leg.result === "pending" ? "PRE" : state.label}
          </span>
        </div>

        <div className="mt-2 rounded bg-[var(--surface)] px-3 py-2">
          <Team name={leg.home_team} score={homeScore} live={showingLive} />
          <Team name={leg.away_team} score={awayScore} live={showingLive} />
        </div>

        {/* What the match finished, and what that made the outcome. */}
        {settledScore && (
          <p className="mt-1.5 text-[12px] text-[var(--text-muted)]">
            FT Score:{" "}
            <span className="font-bold text-[var(--text)]">
              {leg.final_home}:{leg.final_away}
            </span>
          </p>
        )}

        <dl className="relative mt-2 space-y-1 rounded bg-[var(--surface)] px-3 py-2 text-[12px]">
          {leg.result === "won" && (
            <Trophy
              size={38}
              strokeWidth={1.4}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--win)] opacity-10"
            />
          )}
          <div className="flex justify-between">
            <dt className="text-[var(--text-muted)]">Market</dt>
            <dd className="font-medium">{marketName(leg.market)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--text-muted)]">Pick</dt>
            <dd className="flex items-center gap-1 font-medium">
              {leg.outcome} @ {Number(leg.odds).toFixed(2)}
              {leg.result === "won" && (
                <Check size={12} strokeWidth={3} className="text-[var(--win)]" />
              )}
              {drift && (
                <span
                  className="ml-1 text-[10px]"
                  style={{ color: drift === "shortened" ? "var(--win)" : "var(--lose)" }}
                >
                  now {leg.currentOdds!.toFixed(2)}
                </span>
              )}
            </dd>
          </div>

          {outcome && (
            <div className="flex justify-between">
              <dt className="text-[var(--text-muted)]">Outcome</dt>
              <dd className="font-medium" style={{ color: state.colour }}>
                {outcome}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-2 flex items-center justify-between">
          <Link
            href={`/match/${leg.match_id}/tracker`}
            className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--accent)]"
          >
            <LineChart size={13} strokeWidth={2} />
            Match Tracker
          </Link>
          <Link
            href={`/match/${leg.match_id}`}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-[var(--text)] ring-1 ring-[var(--line)]"
          >
            <IdCard size={13} strokeWidth={1.9} />
            Match Details
          </Link>
        </div>
      </div>
    </article>
  );
}

function Team({ name, score, live }: { name: string; score: number | null; live?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="truncate text-[13px] text-[var(--text)]">{name}</span>
      <span
        className="pl-3 text-[13px] font-bold tabular-nums"
        style={{ color: live ? "var(--accent)" : "var(--text-muted)" }}
      >
        {score ?? "-"}
      </span>
    </div>
  );
}

function reasonText(reason: string): string {
  switch (reason) {
    case "leg-lost":
      return "No cashout: a leg on this ticket has lost.";
    case "in-play":
      return "Cashout is closed while a match on this ticket is being played.";
    case "no-live-price":
      return "Cashout unavailable: one of these markets is no longer priced.";
    case "too-small":
      return "The cashout value is too small to offer.";
    case "unavailable":
      return "Cashout is not enabled on this deployment yet.";
    default:
      return "Cashout is not available on this ticket.";
  }
}
