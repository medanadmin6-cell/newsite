"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Bell, Home, Search, Ticket, Flame, PlayCircle, LineChart,
  Star, Info, ChevronDown, ChevronRight, Lock,
} from "lucide-react";
import { BetSlip } from "@/components/BetSlip";
import { SlipButton } from "@/components/Shell";
import { useSlip, useSession, type SlipLeg } from "@/lib/store";
import { formatMoney } from "@/lib/countries";
import type { FeedMatch } from "@/lib/fixtures";
import type { Market, MarketGroup } from "@/lib/odds";
import { MARKET_FILTERS } from "@/lib/markets";

const POLL_MS = 30_000;

export function MatchDetail({ id }: { id: string }) {
  const router = useRouter();
  const [match, setMatch] = useState<FeedMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MarketGroup | "all">("all");
  // Eighty markets cannot all be open at once. The first few are expanded and
  // the rest start collapsed; an explicit toggle always wins over that default.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const OPEN_BY_DEFAULT = 3;
  const [starred, setStarred] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch(`/api/match/${encodeURIComponent(id)}`, { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setError(json.error ?? "Could not load this match");
          return;
        }
        setMatch(json.match);
        setError(null);
      } catch {
        if (alive) setError("Could not load this match");
      }
    };

    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [id]);

  const all = match?.markets ?? [];
  const markets = all.filter((m) => filter === "all" || m.group === filter);

  // A tab with nothing behind it is worse than no tab, so the row only shows
  // groups this fixture actually prices.
  const present = new Set(all.map((m) => m.group));
  const visibleFilters = MARKET_FILTERS.filter((f) => f.key === "all" || present.has(f.key));

  return (
    <>
      <DetailHeader onBack={() => router.back()} />

      <main className="w-full pb-24">
        {error ? (
          <div className="p-10 text-center">
            <p className="text-[14px] text-[var(--text-muted)]">{error}</p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-[3px] bg-[var(--accent)] px-5 py-2.5 text-[13px] font-medium text-[var(--accent-ink)]"
            >
              Back to the board
            </Link>
          </div>
        ) : !match ? (
          <DetailSkeleton />
        ) : (
          <>
            {match.bestOdds && (
              <div className="px-2.5 pt-2.5 md:px-5">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black text-white"
                  style={{ background: "linear-gradient(90deg,#FF5252,#DD2C44)" }}
                >
                  <Flame size={12} strokeWidth={2.4} />
                  Top Odds
                </span>
              </div>
            )}

            <nav className="px-2.5 pt-2.5 text-[12px] text-[var(--text-muted)] md:px-5 md:text-[13px]">
              <Link href="/" className="underline">
                Football
              </Link>
              {" / "}
              <Link href={`/search?q=${encodeURIComponent(match.league)}`} className="underline">
                {match.country} - {match.league}
              </Link>
            </nav>

            <MatchHead match={match} />

            <div className="mt-2 flex items-center justify-between bg-[var(--bg-elevated)] px-3 py-2.5 md:px-5">
              <span className="flex items-center gap-2 text-[12px] text-[var(--text)]">
                <PlayCircle size={16} strokeWidth={1.8} className="text-[var(--accent)]" />
                {match.isLive
                  ? "In-play — betting is closed"
                  : match.postponed
                    ? "Postponed"
                    : "Live In-Play Available"}
              </span>
              <Link
                href={`/match/${id}/tracker`}
                className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--accent)]"
              >
                <LineChart size={15} strokeWidth={2} />
                Tracker
              </Link>
            </div>

            <Watermark />

            <div className="scroll-x flex items-center gap-2 px-2.5 pb-3 md:px-5">
              <button
                onClick={() => setFilter("all")}
                aria-label="Starred markets"
                className="flex h-8 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--accent)]"
              >
                <Star size={15} strokeWidth={2} fill="currentColor" />
              </button>
              {visibleFilters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className="h-8 shrink-0 rounded-full px-4 text-[13px] font-medium"
                  style={
                    filter === f.key
                      ? { background: "var(--accent)", color: "var(--accent-ink)" }
                      : { background: "var(--bg-elevated)", color: "var(--text)" }
                  }
                >
                  {f.label}
                </button>
              ))}
              <Link
                href="/search"
                aria-label="Search"
                className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center text-[var(--text-bright)]"
              >
                <Search size={18} strokeWidth={2} />
              </Link>
            </div>

            <p className="px-2.5 pb-2 text-[11px] text-[var(--text-faint)] md:px-5">
              {all.length} market{all.length === 1 ? "" : "s"}
            </p>

            <div className="space-y-2 px-2.5 md:space-y-3 md:px-5">
              {markets.map((m, i) => (
                <MarketCard
                  key={m.key}
                  match={match}
                  market={m}
                  collapsed={collapsed[m.key] ?? i >= OPEN_BY_DEFAULT}
                  starred={Boolean(starred[m.key])}
                  onToggle={() =>
                    setCollapsed((c) => ({ ...c, [m.key]: !(c[m.key] ?? i >= OPEN_BY_DEFAULT) }))
                  }
                  onStar={() => setStarred((s) => ({ ...s, [m.key]: !s[m.key] }))}
                />
              ))}
            </div>
          </>
        )}
      </main>

      <SlipBar />
      <SlipButton />
      <BetSlip />
    </>
  );
}

function DetailHeader({ onBack }: { onBack: () => void }) {
  const player = useSession((s) => s.player);
  const legs = useSlip((s) => s.legs);

  return (
    <header className="sticky top-0 z-40 bg-[var(--surface)]">
      <div className="flex h-[44px] w-full items-center gap-3 px-2.5 md:px-5">
        <button onClick={onBack} aria-label="Back" className="text-[var(--text-bright)]">
          <ArrowLeft size={22} strokeWidth={2} />
        </button>
        <h1 className="flex-1 text-[16px] font-bold text-[var(--text-bright)]">Details</h1>

        <Link href="/my-bets" aria-label="My bets" className="text-[var(--text-bright)]">
          <Bell size={19} strokeWidth={1.8} />
        </Link>

        <button
          onClick={() => useSlip.getState().setOpen(true)}
          aria-label={`Bet slip, ${legs.length}`}
          className="relative text-[var(--text-bright)]"
        >
          <Ticket size={19} strokeWidth={1.8} />
          <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-black text-[var(--accent-ink)]">
            {legs.length}
          </span>
        </button>

        <Link href={player ? "/account" : "/"} aria-label="Home" className="text-[var(--text-bright)]">
          <Home size={19} strokeWidth={1.8} />
        </Link>
      </div>
    </header>
  );
}

function MatchHead({ match }: { match: FeedMatch }) {
  const d = new Date(match.kickoff);

  return (
    <div className="flex items-start justify-between gap-2 px-4 py-4 md:px-16 md:py-7 lg:px-32">
      <TeamSide name={match.homeTeam} crest={match.homeCrest} />

      <div className="flex shrink-0 flex-col items-center pt-3">
        {match.isLive ? (
          <>
            <span className="text-[22px] font-black text-[var(--text-bright)] md:text-[28px]">
              {match.scoreHome ?? 0} - {match.scoreAway ?? 0}
            </span>
            <span className="mt-1 text-[13px] font-bold text-[var(--live)]">{match.minuteLabel}</span>
          </>
        ) : (
          <>
            <span className="text-[13px] text-[var(--text-muted)]">
              {d.toLocaleDateString([], { day: "numeric", month: "short", weekday: "long" })}
            </span>
            <span className="mt-1 text-[22px] font-bold text-[var(--text-bright)] md:text-[26px]">
              {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
            </span>
          </>
        )}
      </div>

      <TeamSide name={match.awayTeam} crest={match.awayCrest} />
    </div>
  );
}

function TeamSide({ name, crest }: { name: string; crest: string | null }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <Image
        src={crest || "/crest-fallback.svg"}
        alt=""
        width={56}
        height={56}
        className="h-14 w-14 object-contain md:h-16 md:w-16"
        unoptimized
      />
      <span className="text-center text-[13px] leading-tight text-[var(--text)] underline decoration-[var(--text-faint)] underline-offset-2">
        {name}
      </span>
    </div>
  );
}

function Watermark() {
  return (
    <div className="flex items-center gap-3 px-6 py-4 md:px-5">
      <span className="h-px flex-1 bg-[var(--line)]" />
      <span className="text-[10px] font-bold tracking-[0.3em] text-[var(--text-faint)]">STAKEZA</span>
      <span className="h-px flex-1 bg-[var(--line)]" />
    </div>
  );
}

function MarketCard({
  match,
  market,
  collapsed,
  starred,
  onToggle,
  onStar,
}: {
  match: FeedMatch;
  market: Market;
  collapsed: boolean;
  starred: boolean;
  onToggle: () => void;
  onStar: () => void;
}) {
  const toggle = useSlip((s) => s.toggle);
  const legs = useSlip((s) => s.legs);
  const selected = legs.find((l) => l.matchId === match.id);

  const pick = (outcome: string, odds: number, label: string) => {
    const leg: SlipLeg = {
      matchId: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      league: match.league,
      kickoff: match.kickoff,
      market: market.key,
      marketLabel: market.label,
      outcome,
      outcomeLabel: label,
      odds,
    };
    toggle(leg);
  };

  return (
    <section className="overflow-hidden rounded-[6px] bg-[var(--bg-elevated)]">
      <header className="flex items-center gap-2 px-3 py-2.5 md:px-4 md:py-3">
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand market" : "Collapse market"}
          className="text-[var(--accent)]"
        >
          {collapsed ? <ChevronRight size={16} strokeWidth={2.4} /> : <ChevronDown size={16} strokeWidth={2.4} />}
        </button>
        <h2 className="text-[14px] font-medium text-[var(--text-bright)]">{market.label}</h2>
        {market.badge && (
          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-black text-[var(--accent)] ring-1 ring-[var(--accent)]">
            {market.badge}
          </span>
        )}
        <Info size={13} strokeWidth={2} className="text-[var(--text-faint)]" />

        <button
          onClick={onStar}
          aria-label={starred ? "Unstar market" : "Star market"}
          className="ml-auto"
          style={{ color: starred ? "var(--accent)" : "var(--text-faint)" }}
        >
          <Star size={15} strokeWidth={2} fill={starred ? "currentColor" : "none"} />
        </button>
      </header>

      {!collapsed && (
        <div
          className="grid gap-1.5 px-2.5 pb-2.5 md:gap-2 md:px-4 md:pb-4"
          style={{
            // Correct-score style markets carry dozens of outcomes, so they lay
            // out as a dense grid of small tiles rather than full-width rows.
            gridTemplateColumns: market.dense
              ? "repeat(auto-fill, minmax(84px, 1fr))"
              : `repeat(${market.prices.length === 2 ? 2 : 3}, minmax(0,1fr))`,
          }}
        >
          {market.prices.map((p) => {
            const isOn = selected?.market === market.key && selected?.outcome === p.outcome;
            const locked = match.isLocked;

            return (
              <button
                key={p.outcome}
                disabled={locked}
                onClick={() => pick(p.outcome, p.odds, p.label)}
                className={
                  market.dense
                    ? "flex h-[42px] items-center justify-between rounded-[4px] px-2 disabled:opacity-60"
                    : "flex h-[46px] items-center justify-between rounded-[4px] px-3 disabled:opacity-60 md:h-[54px] md:px-5"
                }
                style={{
                  background: isOn ? "var(--accent)" : "var(--surface-3)",
                  color: isOn ? "var(--accent-ink)" : "var(--text)",
                }}
                aria-label={`${market.label}, ${p.label}, ${locked ? "locked" : p.odds}`}
              >
                <span className={market.dense ? "truncate text-[12px]" : "truncate text-[13px] md:text-[15px]"}>
                  {p.label}
                </span>
                {locked ? (
                  <Lock size={14} strokeWidth={2} />
                ) : (
                  <span
                    className={market.dense ? "text-[12px] font-bold" : "text-[15px] font-bold md:text-[18px]"}
                    style={{ color: isOn ? "var(--accent-ink)" : "var(--accent)" }}
                  >
                    {p.odds.toFixed(2)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Bottom bar: what is on the slip, and the way to open it. */
function SlipBar() {
  const legs = useSlip((s) => s.legs);
  const totalOdds = useSlip((s) => s.totalOdds);
  const setOpen = useSlip((s) => s.setOpen);
  const player = useSession((s) => s.player);

  if (!legs.length) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] md:px-5">
      <div className="flex w-full items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-[var(--text-muted)]">
            {legs.length} selection{legs.length === 1 ? "" : "s"}
          </p>
          <p className="text-[14px] font-bold">
            {totalOdds().toFixed(2)}
            {player && (
              <span className="ml-2 text-[12px] font-normal text-[var(--text-muted)]">
                bal {formatMoney(Number(player.balance), player.currency)}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="rounded-[3px] bg-[var(--accent)] px-6 py-2.5 text-[14px] font-bold text-[var(--accent-ink)]"
        >
          Bet slip
        </button>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-3 p-3">
      <div className="h-4 w-40 rounded bg-[var(--bg-elevated)]" />
      <div className="h-28 rounded bg-[var(--bg-elevated)]" />
      <div className="h-9 rounded bg-[var(--bg-elevated)]" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[92px] rounded-[6px] bg-[var(--bg-elevated)]" />
      ))}
    </div>
  );
}
