"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Page } from "@/components/Shell";
import { useSession } from "@/lib/store";
import { formatMoney } from "@/lib/countries";

type LeagueId = "england" | "spain" | "germany" | "italy" | "champions";
type MainMarket = "1x2" | "1up" | "2up";
type Phase = "board" | "live" | "ft";

interface Side {
  code: string;
  stars: number;
  color: string;
}

interface Price {
  market: string;
  outcome: string;
  odds: number;
}

interface Fixture {
  id: string;
  home: Side;
  away: Side;
  prices: Price[];
}

interface LeagueGroup {
  league: LeagueId;
  fixtures: Fixture[];
}

interface Board {
  id: string;
  exp: number;
  leagues: LeagueGroup[];
}

interface Offer {
  token: string;
  board: Board;
}

interface SlipPick {
  key: string;
  fixtureId: string;
  league: LeagueId;
  market: string;
  outcome: string;
  odds: number;
  stake: number;
  home: string;
  away: string;
}

interface PlayedFixture {
  id: string;
  league: LeagueId;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  events: { minute: number; home: number; away: number }[];
}

interface Played {
  balance: number;
  currency: string;
  stake: number;
  totalDebit: number;
  payout: number;
  won: number;
  lost: number;
  tickets: {
    code: string;
    won: boolean;
    odds: number;
    stake: number;
    payout: number;
    market: string;
    outcome: string;
    home: string;
    away: string;
    fixtureId: string;
  }[];
  fixtures: PlayedFixture[];
}

const LEAGUES: { id: LeagueId; label: string }[] = [
  { id: "england", label: "England" },
  { id: "spain", label: "Spain" },
  { id: "germany", label: "Germany" },
  { id: "italy", label: "Italy" },
  { id: "champions", label: "Champions" },
];

const MAIN: { id: MainMarket; label: string }[] = [
  { id: "1x2", label: "1X2" },
  { id: "1up", label: "1X2 - 1UP" },
  { id: "2up", label: "1X2 - 2UP" },
];

const EXTRA = ["ou15", "ou25", "ou35", "btts", "dc", "cs"] as const;

const MARKET_LABEL: Record<string, string> = {
  "1x2": "1X2",
  "1up": "1X2 - 1UP",
  "2up": "1X2 - 2UP",
  ou15: "Over/Under 1.5",
  ou25: "Over/Under 2.5",
  ou35: "Over/Under 3.5",
  btts: "Both Teams to Score",
  dc: "Double Chance",
  cs: "Correct Score",
};

const QUICK_STAKES = [1, 5, 10, 20, 50];
const MIN_STAKE = 1;
const MAX_STAKE = 500;
const MAX_PICKS = 20;
const MATCH_MS = 7000;

function roundMoney(amount: number) {
  return Math.round(amount * 100) / 100;
}

function outcomeText(market: string, outcome: string, home: string, away: string) {
  if (market === "1x2" || market === "1up" || market === "2up") {
    if (outcome === "1") return home;
    if (outcome === "2") return away;
    return "Draw";
  }
  if (outcome === "over") return "Over";
  if (outcome === "under") return "Under";
  if (outcome === "yes") return "Yes";
  if (outcome === "no") return "No";
  return outcome;
}

function extraGroups(prices: Price[]) {
  return EXTRA.map((key) => ({
    key,
    label: MARKET_LABEL[key],
    prices: prices.filter((price) => price.market === key),
  })).filter((group) => group.prices.length > 0);
}

function scoreAt(events: PlayedFixture["events"], minute: number, finalHome: number, finalAway: number) {
  if (minute >= 90) return { home: finalHome, away: finalAway };
  let home = 0;
  let away = 0;
  for (const event of events) {
    if (event.minute > minute) break;
    home = event.home;
    away = event.away;
  }
  return { home, away };
}

function Stars({ n }: { n: number }) {
  return (
    <span className="flex gap-px" aria-label={`${n} of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => (
        <svg key={index} width="9" height="9" viewBox="0 0 20 20" aria-hidden>
          <path
            fill={index < n ? "var(--price)" : "var(--line)"}
            d="M10 1.6 12.5 7l5.9.7-4.4 4 1.2 5.8L10 14.6 4.8 17.5 6 11.7 1.6 7.7 7.5 7 10 1.6z"
          />
        </svg>
      ))}
    </span>
  );
}

function LeagueFlag({ id }: { id: LeagueId }) {
  const frame = "h-4 w-[22px] shrink-0 overflow-hidden rounded-[3px] ring-1 ring-black/10";
  if (id === "spain") {
    return (
      <svg viewBox="0 0 22 16" className={frame} aria-hidden>
        <rect width="22" height="16" fill="#c60b1e" />
        <rect y="4" width="22" height="8" fill="#ffc400" />
      </svg>
    );
  }
  if (id === "germany") {
    return (
      <svg viewBox="0 0 22 16" className={frame} aria-hidden>
        <rect width="22" height="16" fill="#000" />
        <rect y="5.4" width="22" height="5.3" fill="#dd0000" />
        <rect y="10.7" width="22" height="5.3" fill="#ffce00" />
      </svg>
    );
  }
  if (id === "italy") {
    return (
      <svg viewBox="0 0 22 16" className={frame} aria-hidden>
        <rect width="22" height="16" fill="#fff" />
        <rect width="7.4" height="16" fill="#009246" />
        <rect x="14.6" width="7.4" height="16" fill="#ce2b37" />
      </svg>
    );
  }
  if (id === "champions") {
    return (
      <svg viewBox="0 0 22 16" className={frame} aria-hidden>
        <rect width="22" height="16" fill="#0f1c33" />
        <path fill="#e8a317" d="M11 2.2 12.1 5.4h3.4l-2.7 2 1 3.2L11 8.6 8.2 10.6l1-3.2-2.7-2h3.4z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 22 16" className={frame} aria-hidden>
      <rect width="22" height="16" fill="#fff" />
      <rect x="9" width="4" height="16" fill="#cf081f" />
      <rect y="6" width="22" height="4" fill="#cf081f" />
    </svg>
  );
}

function Badge({ code, color }: { code: string; color: string }) {
  return (
    <span
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-black text-white"
      style={{ background: color }}
      aria-hidden
    >
      {code.slice(0, 1)}
    </span>
  );
}

function PriceButton({
  label,
  odds,
  selected,
  disabled,
  onClick,
  caption,
}: {
  label: string;
  odds: number;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  caption?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${label} ${odds.toFixed(2)}`}
      onClick={onClick}
      className={
        caption
          ? "rounded-[3px] px-1 py-1.5 text-center disabled:opacity-40"
          : "h-[34px] w-[54px] rounded-[3px] text-[12px] font-black tabular-nums disabled:opacity-40 md:h-[40px] md:w-[92px] md:text-[14px]"
      }
      style={
        selected
          ? { background: "var(--accent)", color: "var(--accent-ink)" }
          : { background: "var(--odds-btn)", color: "var(--price)" }
      }
    >
      {caption ? (
        <>
          <span
            className="block truncate text-[10px] font-bold leading-tight"
            style={{ color: selected ? "inherit" : "var(--text-muted)" }}
          >
            {caption}
          </span>
          <span className="block text-[12px] font-black tabular-nums">{odds.toFixed(2)}</span>
        </>
      ) : (
        odds.toFixed(2)
      )}
    </button>
  );
}

export default function VirtualsPage() {
  const router = useRouter();
  const player = useSession((s) => s.player);
  const hydrated = useSession((s) => s.hydrated);
  const setBalance = useSession((s) => s.setBalance);

  const [pack, setPack] = useState<Offer | null>(null);
  const [market, setMarket] = useState<MainMarket>("1x2");
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const [picks, setPicks] = useState<SlipPick[]>([]);
  const [slipOpen, setSlipOpen] = useState(false);
  const [defaultStake, setDefaultStake] = useState(5);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("board");
  const [minute, setMinute] = useState(0);
  const [played, setPlayed] = useState<Played | null>(null);
  const playing = useRef(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    setPlayed(null);
    setPhase("board");
    setMinute(0);
    setPicks([]);
    setSlipOpen(false);
    setOpenRows({});
    try {
      const res = await fetch("/api/virtuals/offer", { cache: "no-store" });
      const json = await res.json();
      if (id !== requestId.current) return;
      if (!res.ok) {
        setPack(null);
        setError(json.error ?? "Could not load a round");
        return;
      }
      setPack(json);
    } catch {
      if (id !== requestId.current) return;
      setPack(null);
      setError("Could not load a round");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (phase !== "live" || !played) return;
    const started = performance.now();
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - started;
      if (elapsed >= MATCH_MS) {
        setMinute(90);
        setPhase("ft");
        setBalance(Number(played.balance));
        window.clearInterval(timer);
        return;
      }
      setMinute(Math.min(89, Math.floor((elapsed / MATCH_MS) * 90)));
    }, 80);
    return () => window.clearInterval(timer);
  }, [phase, played, setBalance]);

  const requirePlayer = () => {
    if (!hydrated) return false;
    if (!player) {
      router.push("/login?next=/virtuals");
      return false;
    }
    return true;
  };

  const openSlip = () => {
    if (!requirePlayer()) return;
    setSlipOpen(true);
  };

  const nextRound = () => {
    if (busy) return;
    if (played) setBalance(Number(played.balance));
    void load();
  };

  const selected = (fixtureId: string, key: string, outcome: string) =>
    picks.some((pick) => pick.fixtureId === fixtureId && pick.market === key && pick.outcome === outcome);

  const toggle = (fixture: Fixture, league: LeagueId, key: string, outcome: string, odds: number) => {
    if (phase !== "board" || busy) return;
    const id = `${fixture.id}|${key}|${outcome}`;
    const exists = picks.some((pick) => pick.key === id);
    if (!exists && picks.length >= MAX_PICKS) {
      setError(`A slip can hold at most ${MAX_PICKS} picks`);
      return;
    }
    setError(null);
    setPicks((current) =>
      exists
        ? current.filter((pick) => pick.key !== id)
        : [
            ...current,
            {
              key: id,
              fixtureId: fixture.id,
              league,
              market: key,
              outcome,
              odds,
              stake: defaultStake,
              home: fixture.home.code,
              away: fixture.away.code,
            },
          ],
    );
  };

  const showResult = () => {
    if (!played) return;
    setMinute(90);
    setPhase("ft");
    setBalance(Number(played.balance));
  };

  const kickOff = async () => {
    if (!pack || playing.current || phase !== "board") return;
    if (!requirePlayer() || !player) return;
    if (!picks.length) {
      setError("Your slip is empty");
      return;
    }
    if (picks.some((pick) => !Number.isFinite(pick.stake) || pick.stake < MIN_STAKE || pick.stake > MAX_STAKE)) {
      setError(`Each single needs a stake between ${MIN_STAKE} and ${MAX_STAKE}`);
      return;
    }
    playing.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/virtuals/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: player.id,
          token: pack.token,
          board: pack.board,
          picks: picks.map((pick) => ({
            fixtureId: pick.fixtureId,
            market: pick.market,
            outcome: pick.outcome,
            stake: roundMoney(pick.stake),
          })),
        }),
      });
      const json = await res.json();
      if (res.status === 401) {
        router.push("/login?next=/virtuals");
        return;
      }
      if (!res.ok) {
        setError(json.error ?? "Could not kick off");
        return;
      }
      setPlayed(json);
      setPicks([]);
      setSlipOpen(false);
      setMinute(0);
      setPhase("live");
    } catch {
      setError("Network problem. Try again.");
    } finally {
      playing.current = false;
      setBusy(false);
    }
  };

  const stakeOk = picks.every(
    (pick) => Number.isFinite(pick.stake) && pick.stake >= MIN_STAKE && pick.stake <= MAX_STAKE,
  );
  const totalStake = roundMoney(picks.reduce((sum, pick) => sum + (Number.isFinite(pick.stake) ? pick.stake : 0), 0));
  const potential = picks.reduce(
    (sum, pick) => sum + (Number.isFinite(pick.stake) ? roundMoney(pick.stake * pick.odds) : 0),
    0,
  );

  return (
    <Page hideSlip>
      <div className="min-w-0 px-3 pb-16 pt-3">
        <h1 className="text-[20px] font-black">Instant Football</h1>
        <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
          Singles only. Pick from England, Spain and the rest, then kick off.
        </p>

        <nav className="scroll-x mt-3 flex gap-4 border-b border-[var(--line)]" aria-label="Markets">
          {MAIN.map((item) => {
            const on = item.id === market;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setMarket(item.id)}
                className="shrink-0 border-b-2 py-2.5 text-[13px] font-bold"
                style={{
                  borderColor: on ? "var(--accent)" : "transparent",
                  color: on ? "var(--accent)" : "var(--text-muted)",
                }}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {error && phase === "board" && !slipOpen && (
          <p className="mt-3 rounded-xl bg-[var(--lose-bg)] px-3 py-2 text-[12px] font-bold text-[var(--lose)]">{error}</p>
        )}

        {phase !== "board" && played && (
          <p className="mt-3 text-center text-[12px] font-bold text-[var(--text-muted)]">
            {phase === "ft" ? (
              "Full time"
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[var(--live)]">
                <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-[var(--live)]" />
                {minute}&apos;
              </span>
            )}
          </p>
        )}

        {phase === "board" && loading && (
          <div className="mt-2 space-y-2" aria-busy="true">
            <p className="sr-only">Loading the round…</p>
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="h-[76px] rounded-2xl bg-white shadow-sm" />
            ))}
          </div>
        )}

        {!loading && pack && (phase === "board" || played) && (
          <div className="mt-3 space-y-4">
            {pack.board.leagues.map((group) => {
              const leagueName = LEAGUES.find((item) => item.id === group.league)?.label ?? group.league;
              return (
                <section key={group.league}>
                  <div className="flex items-center justify-between px-1">
                    <p className="flex items-center gap-2 text-[13px] font-black text-[var(--text-bright)]">
                      <LeagueFlag id={group.league} />
                      {leagueName}
                    </p>
                    {phase === "board" ? (
                      <div className="flex gap-1 text-[10px] font-bold text-[var(--text-faint)] md:gap-1.5">
                        {["1", "X", "2"].map((label) => (
                          <span key={label} className="w-[54px] text-center md:w-[92px]">
                            {label}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold text-[var(--text-faint)]">Score</span>
                    )}
                  </div>
                  <ul className="mt-2 space-y-2">
                    {group.fixtures.map((fixture) => {
                      const groups = extraGroups(fixture.prices);
                      const open = Boolean(openRows[fixture.id]);
                      const playedRow = played?.fixtures.find((row) => row.id === fixture.id);
                      const score = playedRow
                        ? scoreAt(playedRow.events, minute, playedRow.homeGoals, playedRow.awayGoals)
                        : null;
                      const mainPrices = (["1", "X", "2"] as const).map((outcome) =>
                        fixture.prices.find((price) => price.market === market && price.outcome === outcome),
                      );
                      return (
                        <li key={fixture.id} className="rounded-2xl bg-white p-3 shadow-sm">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <Badge code={fixture.home.code} color={fixture.home.color} />
                                <span className="truncate text-[13px] font-bold text-[var(--text-bright)]">{fixture.home.code}</span>
                                <Stars n={fixture.home.stars} />
                              </div>
                              <div className="mt-1 flex min-w-0 items-center gap-1.5">
                                <Badge code={fixture.away.code} color={fixture.away.color} />
                                <span className="truncate text-[13px] font-bold text-[var(--text-bright)]">{fixture.away.code}</span>
                                <Stars n={fixture.away.stars} />
                              </div>
                            </div>
                            {phase === "board" || !score ? (
                              <div className="flex shrink-0 gap-1 md:gap-1.5">
                                {mainPrices.map((price, index) =>
                                  price ? (
                                    <PriceButton
                                      key={price.outcome}
                                      label={`${fixture.home.code} vs ${fixture.away.code} ${price.outcome}`}
                                      odds={price.odds}
                                      selected={selected(fixture.id, market, price.outcome)}
                                      disabled={busy}
                                      onClick={() => toggle(fixture, group.league, market, price.outcome, price.odds)}
                                    />
                                  ) : (
                                    <span key={index} className="h-[34px] w-[54px] md:h-[40px] md:w-[92px]" />
                                  ),
                                )}
                              </div>
                            ) : (
                              <p className="min-w-[92px] text-center text-[20px] font-black tabular-nums text-[var(--text-bright)]">
                                {score.home}
                                <span className="px-1 text-[var(--text-faint)]">-</span>
                                {score.away}
                              </p>
                            )}
                          </div>
                          {phase === "board" && (
                            <button
                              type="button"
                              aria-expanded={open}
                              onClick={() => setOpenRows((current) => ({ ...current, [fixture.id]: !open }))}
                              className="mt-1.5 inline-flex items-center text-[10px] text-[var(--text-faint)]"
                            >
                              +{groups.length} markets
                              <ChevronRight size={11} strokeWidth={2} className={open ? "rotate-90" : ""} />
                            </button>
                          )}
                          {phase === "board" && open && (
                            <div className="mt-2 space-y-2 border-t border-[var(--line)] pt-2">
                              {groups.map((extra) => (
                                <div key={extra.key}>
                                  <p className="text-[11px] font-bold text-[var(--text-muted)]">{extra.label}</p>
                                  <div className={`mt-1 grid gap-1 ${extra.prices.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                                    {extra.prices.map((price) => (
                                      <PriceButton
                                        key={price.outcome}
                                        label={`${fixture.home.code} vs ${fixture.away.code} ${extra.label} ${outcomeText(extra.key, price.outcome, fixture.home.code, fixture.away.code)}`}
                                        caption={outcomeText(extra.key, price.outcome, fixture.home.code, fixture.away.code)}
                                        odds={price.odds}
                                        selected={selected(fixture.id, extra.key, price.outcome)}
                                        disabled={busy}
                                        onClick={() => toggle(fixture, group.league, extra.key, price.outcome, price.odds)}
                                      />
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
            {phase === "live" && (
              <button
                type="button"
                onClick={showResult}
                className="w-full rounded-full border border-[var(--line)] bg-white py-3 text-[14px] font-bold text-[var(--text-bright)] shadow-sm"
              >
                Show result
              </button>
            )}
            {phase === "ft" && played && (
              <div className="rounded-2xl bg-white p-3 text-center shadow-sm">
                <p className={`text-[18px] font-black ${played.payout > 0 ? "text-[var(--win)]" : "text-[var(--lose)]"}`}>
                  {played.won} won · {played.lost} lost
                </p>
                <p className="mt-1 text-[14px] font-bold text-[var(--text-bright)]">
                  Returned {formatMoney(played.payout, played.currency)}
                </p>
                <p className="mt-1 text-[13px] font-bold text-[var(--text-muted)]">
                  Balance {formatMoney(played.balance, played.currency)}
                </p>
                <ul className="mt-3 space-y-1 text-left">
                  {played.tickets.map((ticket) => (
                    <li key={ticket.code} className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="min-w-0 truncate font-bold text-[var(--text)]">
                        {ticket.home} vs {ticket.away} · {MARKET_LABEL[ticket.market] ?? ticket.market} ·{" "}
                        {outcomeText(ticket.market, ticket.outcome, ticket.home, ticket.away)}
                      </span>
                      <span className={`shrink-0 font-black ${ticket.won ? "text-[var(--win)]" : "text-[var(--lose)]"}`}>
                        {formatMoney(ticket.stake, played.currency)}
                        {" · "}
                        {ticket.won ? `+${formatMoney(ticket.payout, played.currency)}` : "Lost"}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/my-bets"
                  className="mt-4 block rounded-full bg-[var(--accent)] py-3 text-[14px] font-bold text-[var(--accent-ink)]"
                >
                  My Bets
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {!slipOpen && (
        <div
          className="fixed inset-x-0 z-30 px-3"
          style={{ bottom: "calc(74px + env(safe-area-inset-bottom))" }}
        >
          <div className="flex gap-2 rounded-2xl bg-white p-2 shadow-sm">
            <button
              type="button"
              onClick={nextRound}
              disabled={busy || loading}
              className="h-11 flex-1 rounded-full border border-[var(--line)] bg-white text-[14px] font-bold text-[var(--text-bright)] disabled:opacity-50"
            >
              Next Round
            </button>
            <button
              type="button"
              onClick={openSlip}
              className="h-11 flex-1 rounded-full bg-[var(--accent)] text-[14px] font-bold text-[var(--accent-ink)]"
            >
              Singles ({picks.length})
            </button>
          </div>
        </div>
      )}

      {slipOpen && player && (
        <div className="fixed inset-0 z-30 flex flex-col">
          <button type="button" aria-label="Close betslip" className="min-h-16 flex-1 bg-black/40" onClick={() => setSlipOpen(false)} />
          <section className="max-h-[78%] overflow-y-auto rounded-t-2xl bg-white px-3 pb-[calc(4.75rem+env(safe-area-inset-bottom))] pt-3 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-black text-[var(--text-bright)]">Singles ({picks.length})</h2>
              <button type="button" onClick={() => setSlipOpen(false)} className="text-[13px] font-bold text-[var(--text-muted)]">
                Close
              </button>
            </div>
            {picks.length === 0 ? (
              <p className="mt-3 text-[13px] font-bold text-[var(--text-muted)]">Tap a price to add it.</p>
            ) : (
              <ul className="mt-2 divide-y divide-[var(--line)]">
                {picks.map((pick) => (
                  <li key={pick.key} className="py-2">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-black text-[var(--text-bright)]">
                          {pick.home} vs {pick.away}
                        </p>
                        <p className="truncate text-[11px] font-bold text-[var(--text-muted)]">
                          {LEAGUES.find((item) => item.id === pick.league)?.label} · {MARKET_LABEL[pick.market] ?? pick.market} ·{" "}
                          {outcomeText(pick.market, pick.outcome, pick.home, pick.away)}
                        </p>
                      </div>
                      <span className="text-[14px] font-black tabular-nums text-[var(--price)]">{pick.odds.toFixed(2)}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${pick.home} vs ${pick.away}`}
                        onClick={() => setPicks((current) => current.filter((row) => row.key !== pick.key))}
                        className="px-1 text-[18px] font-black leading-none text-[var(--text-faint)]"
                      >
                        ×
                      </button>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-1.5">
                        <span className="text-[11px] font-bold text-[var(--text-muted)]">{player.currency}</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={MIN_STAKE}
                          max={MAX_STAKE}
                          value={Number.isFinite(pick.stake) ? pick.stake : ""}
                          aria-label={`Stake for ${pick.home} vs ${pick.away}`}
                          onChange={(event) => {
                            const next = event.target.value === "" ? Number.NaN : Number(event.target.value);
                            setPicks((current) =>
                              current.map((row) => (row.key === pick.key ? { ...row, stake: next } : row)),
                            );
                          }}
                          className="w-full bg-transparent text-right text-[15px] font-black text-[var(--text-bright)] outline-none"
                        />
                      </label>
                      <span className="shrink-0 text-[11px] font-bold text-[var(--text-muted)]">
                        Returns{" "}
                        {formatMoney(
                          Number.isFinite(pick.stake) ? roundMoney(pick.stake * pick.odds) : 0,
                          player.currency,
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-3 text-[11px] font-bold text-[var(--text-muted)]">
              Singles only. Set a stake on each one. They do not combine.
            </p>
            <p className="mt-2 text-[12px] font-bold text-[var(--text-muted)]">Set every stake</p>
            <div className="mt-1 flex gap-2">
              {QUICK_STAKES.map((amount) => {
                const on = picks.length
                  ? picks.every((pick) => pick.stake === amount)
                  : defaultStake === amount;
                return (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => {
                      setDefaultStake(amount);
                      setPicks((current) => current.map((pick) => ({ ...pick, stake: amount })));
                    }}
                    className="flex-1 rounded-full py-1.5 text-[12px] font-bold"
                    style={
                      on
                        ? { background: "var(--accent)", color: "var(--accent-ink)" }
                        : { background: "var(--surface-2)", color: "var(--text)" }
                    }
                  >
                    {amount}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 flex items-center justify-between text-[13px]">
              <span className="font-bold text-[var(--text-muted)]">Total stake</span>
              <span className="font-black text-[var(--text-bright)]">{formatMoney(totalStake, player.currency)}</span>
            </p>
            <p className="mt-1 flex items-center justify-between text-[13px]">
              <span className="font-bold text-[var(--text-muted)]">Potential return</span>
              <span className="font-black text-[var(--text-bright)]">{formatMoney(roundMoney(potential), player.currency)}</span>
            </p>
            {error && (
              <p className="mt-2 rounded-xl bg-[var(--lose-bg)] px-3 py-2 text-[12px] font-bold text-[var(--lose)]">{error}</p>
            )}
            <button
              type="button"
              disabled={!picks.length || !stakeOk || busy}
              onClick={() => void kickOff()}
              className="mt-3 w-full rounded-full bg-[var(--accent)] py-3 text-[15px] font-bold text-[var(--accent-ink)] disabled:opacity-40"
            >
              {busy ? "Kicking off…" : "Kick off"}
            </button>
          </section>
        </div>
      )}
    </Page>
  );
}
