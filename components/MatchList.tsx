"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Lock, ChevronRight, Flame } from "lucide-react";
import { useSlip, usePopularity, type SlipLeg } from "@/lib/store";
import { useNow } from "@/lib/now";
import type { FeedMatch } from "@/lib/fixtures";

/**
 * The fixture board. Polls the feed every 30 seconds, which is also what drives
 * settlement and goal alerts server-side.
 */

const POLL_MS = 30_000;

const MARKET_TABS = [
  { key: "1x2", label: "1X2", cols: ["1", "X", "2"] },
  { key: "ou25", label: "O/U", cols: ["O2.5", "U2.5"] },
  { key: "dc", label: "Double Chance", cols: ["1X", "12", "X2"] },
  { key: "ou15", label: "O/U 1.5", cols: ["O1.5", "U1.5"] },
  { key: "btts", label: "GG/NG", cols: ["GG", "NG"] },
];

export function MatchList({
  tab = "football",
  matches: provided,
  emptyLabel = "No matches here right now. Check back shortly.",
  limit,
}: {
  tab?: string;
  /** Pass a feed to render from it; omit and the list polls for its own. */
  matches?: FeedMatch[] | null;
  emptyLabel?: string;
  /** Cap the rows shown. The home page wants a taste, not the whole board. */
  limit?: number;
}) {
  const [fetched, setFetched] = useState<FeedMatch[] | null>(null);
  const [market, setMarket] = useState("1x2");
  const [error, setError] = useState<string | null>(null);
  const seed = usePopularity((s) => s.seed);
  const now = useNow();

  const owned = provided === undefined;
  const matches = owned ? fetched : provided;

  useEffect(() => {
    // A parent that already polls hands its feed down, so several lists on one
    // page share a single request rather than each opening their own.
    if (!owned) return;
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch("/api/fixtures", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (!alive) return;
        setFetched(json.matches ?? []);
        setError(null);
      } catch {
        if (alive) setError("Could not load matches. Retrying…");
      }
    };

    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [owned]);

  // Popularity counts are generated once per page view.
  useEffect(() => {
    if (matches?.length) seed(matches.map((m) => m.id));
  }, [matches, seed]);

  const filtered = useMemo(() => {
    if (!matches) return null;
    if (tab === "live") return matches.filter((m) => m.isLive);
    if (tab === "boosted") return matches.filter((m) => m.bestOdds);
    if (tab === "soon") {
      const cutoff = now + 3 * 3_600_000;
      return matches.filter((m) => !m.isLive && new Date(m.kickoff).getTime() <= cutoff);
    }
    if (tab === "today") {
      const today = new Date(now).toDateString();
      return matches.filter((m) => new Date(m.kickoff).toDateString() === today);
    }
    // "Upcoming" means what it says: a match already in play belongs to Live,
    // and showing it in both is how a six-row section ends up all live.
    if (tab === "upcoming") return matches.filter((m) => !m.isLive);
    return matches;
  }, [matches, tab, now]);

  const grouped = useMemo(() => {
    if (!filtered) return [];

    // The house's own matches come first, then whatever the feed brought, and
    // only then is the list cut to size — so a limit never costs a custom game
    // its place.
    const ordered = [
      ...filtered.filter((m) => m.source === "custom"),
      ...filtered.filter((m) => m.source !== "custom"),
    ];
    const shown = limit ? ordered.slice(0, limit) : ordered;

    const map = new Map<string, FeedMatch[]>();
    for (const m of shown) {
      const list = map.get(m.league) ?? [];
      list.push(m);
      map.set(m.league, list);
    }
    return [...map.entries()];
  }, [filtered, limit]);

  const activeTab = MARKET_TABS.find((t) => t.key === market) ?? MARKET_TABS[0];

  if (error && !matches) {
    return <div className="p-8 text-center text-[var(--text-muted)]">{error}</div>;
  }

  if (!filtered) return <BoardSkeleton />;

  if (!filtered.length) {
    return (
      <div className="rounded bg-[var(--bg-elevated)] p-8 text-center text-[13px] text-[var(--text-muted)]">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="scroll-x flex gap-1.5 pb-1 md:gap-2 md:pb-2">
        {MARKET_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setMarket(t.key)}
            className="whitespace-nowrap rounded px-3 py-1.5 text-[12px] font-bold transition-colors"
            style={
              market === t.key
                ? { background: "var(--accent)", color: "var(--accent-ink)" }
                : { background: "var(--surface)", color: "var(--text-muted)" }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {grouped.map(([league, list]) => (
        <section key={league} className="overflow-hidden rounded bg-[var(--bg-elevated)]">
          <header className="flex items-center justify-between bg-[var(--surface)] px-3 py-2 md:px-4">
            <h2 className="truncate text-[12px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              {league}
            </h2>
            <div className="flex shrink-0 gap-1 md:gap-1.5">
              {activeTab.cols.map((c) => (
                <span
                  key={c}
                  className="w-[54px] text-center text-[10px] font-bold text-[var(--text-faint)] md:w-[92px] md:text-[11px]"
                >
                  {c}
                </span>
              ))}
            </div>
          </header>

          <div className="divide-y divide-[var(--line)]">
            {list.map((m) => (
              <MatchRow key={m.id} match={m} marketKey={activeTab.key} cols={activeTab.cols} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MatchRow({
  match,
  marketKey,
  cols,
}: {
  match: FeedMatch;
  marketKey: string;
  cols: string[];
}) {
  const toggle = useSlip((s) => s.toggle);
  const legs = useSlip((s) => s.legs);
  const count = usePopularity((s) => s.counts[match.id]);

  const market = match.markets.find((m) => m.key === marketKey);
  const selected = legs.find((l) => l.matchId === match.id);

  const pick = (outcome: string, odds: number, label: string) => {
    const leg: SlipLeg = {
      matchId: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      league: match.league,
      kickoff: match.kickoff,
      market: marketKey,
      marketLabel: market?.label ?? marketKey,
      outcome,
      outcomeLabel: label,
      odds,
    };
    toggle(leg);
  };

  return (
    <div className="px-3 py-2.5 md:px-4 md:py-3">
      {/* A running match leads with its clock and competition. */}
      {match.isLive && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="flex h-[18px] items-center gap-1 rounded-full bg-[var(--live)] px-1.5">
            <Flame size={10} strokeWidth={2.6} className="text-white" />
            <span className="text-[10px] font-black text-white">{match.minuteLabel}</span>
          </span>
          <span className="rounded-sm px-1 text-[9px] font-black text-[var(--live)] ring-1 ring-[var(--live)]">
            LIVE
          </span>
          <Link
            href={`/search?q=${encodeURIComponent(match.league)}`}
            className="truncate text-[11px] text-[var(--text-muted)] underline decoration-[var(--text-faint)]"
          >
            {match.country} - {match.league}
          </Link>
        </div>
      )}

      <div className="flex items-center gap-2 md:gap-4">
        {!match.isLive && (
          <div className="w-12 shrink-0 text-center md:w-16">
            <KickoffTime iso={match.kickoff} />
          </div>
        )}

        <Link href={`/match/${match.id}`} className="min-w-0 flex-1">
          <TeamLine name={match.homeTeam} crest={match.homeCrest} score={match.scoreHome} />
          <TeamLine name={match.awayTeam} crest={match.awayCrest} score={match.scoreAway} />
          <div className="mt-0.5 flex items-center gap-2">
          {match.bestOdds && (
            <span className="inline-flex items-center gap-0.5 rounded-sm bg-[var(--accent)] px-1 py-px text-[9px] font-black text-[var(--accent-ink)]">
              <Flame size={9} strokeWidth={2.6} />
              BEST ODDS
            </span>
          )}
          {match.postponed && (
            <span className="text-[10px] font-semibold text-[var(--pending)]">Postponed</span>
          )}
          {count != null && !match.isLive && (
            <span className="text-[10px] text-[var(--text-faint)]">{count.toLocaleString()} betting</span>
          )}
            <span className="ml-auto inline-flex items-center text-[10px] text-[var(--text-faint)]">
              +{match.markets.length} markets
              <ChevronRight size={11} strokeWidth={2} />
            </span>
          </div>
        </Link>

        <div className="flex shrink-0 gap-1 md:gap-1.5">
        {cols.map((outcome) => {
          const price = market?.prices.find((p) => p.outcome === outcome);
          const isOn = selected?.market === marketKey && selected?.outcome === outcome;
          const disabled = match.isLocked || !price;

          return (
            <button
              key={outcome}
              disabled={disabled}
              onClick={() => price && pick(outcome, price.odds, price.label)}
              className="h-[34px] w-[54px] rounded-[3px] text-[12px] font-black transition-colors disabled:opacity-35 md:h-[40px] md:w-[92px] md:text-[14px]"
              style={
                isOn
                  ? { background: "var(--accent)", color: "var(--accent-ink)" }
                  : { background: "var(--odds-btn)", color: "var(--price)" }
              }
              aria-label={`${match.homeTeam} v ${match.awayTeam}, ${outcome}, ${price?.odds ?? "unavailable"}`}
            >
              {disabled && !price ? (
                "—"
              ) : match.isLocked ? (
                <Lock size={13} strokeWidth={2} className="mx-auto" />
              ) : (
                price!.odds.toFixed(2)
              )}
            </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Kickoff in the viewer's own timezone.
 *
 * Safe to format during render: the board only ever has fixtures after the
 * client-side fetch resolves, so this never runs during the server pass and
 * cannot produce a hydration mismatch.
 */
function KickoffTime({ iso }: { iso: string }) {
  const now = useNow();
  const d = new Date(iso);
  // Read off the subscribed clock so a match does not keep saying "today"
  // after midnight has passed on an open tab.
  const today = new Date(now).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const date = d.toLocaleDateString([], { day: "2-digit", month: "2-digit" });

  return (
    <time
      dateTime={iso}
      className="block text-[11px] font-medium leading-tight text-[var(--text-muted)]"
    >
      {!today && <span className="block text-[10px] text-[var(--text-faint)]">{date}</span>}
      {time}
    </time>
  );
}

function TeamLine({
  name,
  crest,
  score,
}: {
  name: string;
  crest: string | null;
  score: number | null;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Image
        src={crest || "/crest-fallback.svg"}
        alt=""
        width={16}
        height={16}
        className="h-4 w-4 shrink-0 rounded-full object-contain"
        unoptimized
      />
      <span className="truncate text-[13px] font-bold text-[var(--text-bright)] md:text-[14px]">{name}</span>
      {score != null && (
        <span className="ml-auto pl-2 text-[13px] font-bold text-[var(--accent)]">{score}</span>
      )}
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((s) => (
        <div key={s} className="overflow-hidden rounded bg-[var(--bg-elevated)]">
          <div className="h-9 bg-[var(--surface)]" />
          {[0, 1, 2, 3].map((r) => (
            <div key={r} className="flex items-center gap-2 border-t border-[var(--line)] px-2.5 py-2.5 md:px-4 md:py-3">
              <div className="h-8 flex-1 rounded bg-[var(--surface)] opacity-60" />
              <div className="h-[34px] w-[54px] rounded-[3px] bg-[var(--odds-btn)] opacity-60 md:h-[40px] md:w-[92px]" />
              <div className="h-[34px] w-[54px] rounded-[3px] bg-[var(--odds-btn)] opacity-60 md:h-[40px] md:w-[92px]" />
              <div className="h-[34px] w-[54px] rounded-[3px] bg-[var(--odds-btn)] opacity-60 md:h-[40px] md:w-[92px]" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
