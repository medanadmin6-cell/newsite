"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Page } from "@/components/Shell";
import { MatchList } from "@/components/MatchList";
import { BetSlip } from "@/components/BetSlip";
import { SupportChat } from "@/components/SupportChat";
import { useSlip, type SlipLeg } from "@/lib/store";
import type { FeedMatch } from "@/lib/fixtures";

const POLL_MS = 30_000;

const ACTIONS = [
  { label: "Football", href: "/?tab=football" },
  { label: "Today", href: "/?tab=today" },
  { label: "Live", href: "/?tab=live" },
  { label: "Instant", href: "/virtuals" },
  { label: "Codes", href: "/load-code" },
  { label: "Sports", href: "/az" },
];

const LIVE_SPORTS = [
  { key: "soccer", label: "Soccer" },
  { key: "vsoccer", label: "V-Soccer" },
  { key: "esoccer", label: "ESports Soccer" },
  { key: "basketball", label: "Basketball" },
];

function isSoccer(match: FeedMatch) {
  const sport = (match.sport || "football").toLowerCase();
  return sport === "football" || sport === "soccer";
}

export function HomeBoard() {
  const tab = useSearchParams().get("tab");
  const [feed, setFeed] = useState<FeedMatch[] | null>(null);
  const [league, setLeague] = useState("all");
  const [liveSport, setLiveSport] = useState("soccer");
  const rail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/fixtures", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (alive) setFeed(json.matches ?? []);
      } catch {
        /* MatchList below still has its own empty state */
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const leagues = useMemo(() => {
    const counts = new Map<string, number>();
    for (const match of feed ?? []) {
      if (match.isLive || !isSoccer(match)) continue;
      counts.set(match.league, (counts.get(match.league) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);
  }, [feed]);

  const featured = useMemo(() => {
    const upcoming = (feed ?? []).filter((match) => !match.isLive && isSoccer(match));
    const pool = league === "all" ? upcoming : upcoming.filter((match) => match.league === league);
    return [...pool.filter((match) => match.bestOdds), ...pool.filter((match) => !match.bestOdds)].slice(0, 8);
  }, [feed, league]);

  const live = useMemo(() => (feed ?? []).filter((match) => match.isLive && isSoccer(match)), [feed]);

  if (tab) {
    return (
      <Page>
        <div className="px-3 pt-3">
          <MatchList tab={tab} />
        </div>
        <BetSlip />
        <SupportChat />
      </Page>
    );
  }

  return (
    <Page>
      <div className="space-y-3 px-3 pt-3">
        <section className="rounded-3xl bg-[#0f1c33] px-5 py-5 text-white">
          <p className="text-[11px] font-bold tracking-[0.16em] text-white/45">THE BOARD</p>
          <h1 className="mt-1 text-[26px] font-black leading-none">Today&apos;s football</h1>
          <p className="mt-2 max-w-[260px] text-[13px] leading-snug text-white/65">
            Price a real match, or start an instant round that settles on your wallet.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link href="/?tab=football" className="rounded-2xl bg-white px-3 py-3 text-center text-[13px] font-black text-[#0f1c33]">
              Matches
            </Link>
            <Link href="/virtuals" className="rounded-2xl bg-[#2f6bff] px-3 py-3 text-center text-[13px] font-black text-white">
              Instant
            </Link>
          </div>
        </section>

        <div className="scroll-x flex gap-2">
          {ACTIONS.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="shrink-0 rounded-full bg-white px-3 py-2 text-[12px] font-bold text-[var(--text-bright)] shadow-sm"
            >
              {action.label}
            </Link>
          ))}
        </div>

        <section className="rounded-3xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-black text-[var(--text-bright)]">Featured</h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous matches"
                onClick={() => rail.current?.scrollBy({ left: -180, behavior: "smooth" })}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--line)] text-[var(--text-muted)]"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                aria-label="Next matches"
                onClick={() => rail.current?.scrollBy({ left: 180, behavior: "smooth" })}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--line)] text-[var(--text-muted)]"
              >
                <ChevronRight size={14} />
              </button>
              <Link href="/?tab=boosted" className="ml-1 text-[12px] font-bold text-[var(--accent)]">
                Best odds
              </Link>
            </div>
          </div>

          <div className="scroll-x mt-3 flex gap-2">
            <LeaguePill label="Top Football" on={league === "all"} onClick={() => setLeague("all")} />
            {leagues.map((name) => (
              <LeaguePill key={name} label={name} on={league === name} onClick={() => setLeague(name)} />
            ))}
          </div>

          {feed === null ? (
            <div className="mt-3 h-[150px] rounded-xl bg-[var(--surface-2)]" />
          ) : featured.length ? (
            <div ref={rail} className="scroll-x mt-3 flex gap-2">
              {featured.map((match) => (
                <FeaturedCard key={match.id} match={match} />
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-[13px] text-[var(--text-muted)]">No matches in this league right now.</p>
          )}
        </section>

        <section className="rounded-3xl bg-white p-4 shadow-sm">
          <div className="scroll-x flex items-center gap-4">
            <span className="flex shrink-0 items-center gap-1 text-[15px] font-black text-[var(--text-bright)]">
              <span className="live-dot h-2 w-2 rounded-full bg-[var(--live)]" />
              Live
            </span>
            {LIVE_SPORTS.map((sport) => (
              <button
                key={sport.key}
                type="button"
                onClick={() => setLiveSport(sport.key)}
                className="shrink-0 text-[13px] font-bold"
                style={{ color: liveSport === sport.key ? "var(--accent)" : "var(--text-muted)" }}
              >
                {sport.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[12px] font-bold text-[var(--text-muted)]">In play now</p>
          <div className="mt-2">
            {liveSport === "soccer" ? (
              <MatchList
                tab="live"
                matches={feed === null ? null : live}
                emptyLabel="No live matches currently available."
              />
            ) : (
              <p className="rounded-xl bg-[var(--surface-2)] px-3 py-8 text-center text-[13px] text-[var(--text-muted)]">
                No live matches currently available.
              </p>
            )}
          </div>
        </section>
      </div>
      <BetSlip />
      <SupportChat />
    </Page>
  );
}

function LeaguePill({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-full px-3 py-1 text-[12px] font-bold"
      style={
        on
          ? { background: "var(--accent)", color: "#fff" }
          : { background: "#fff", color: "var(--text-muted)", boxShadow: "inset 0 0 0 1px var(--line)" }
      }
    >
      {label}
    </button>
  );
}

function FeaturedCard({ match }: { match: FeedMatch }) {
  const toggle = useSlip((s) => s.toggle);
  const legs = useSlip((s) => s.legs);
  const market = match.markets.find((item) => item.key === "1x2");
  const selected = legs.find((leg) => leg.matchId === match.id);
  const kickoff = new Date(match.kickoff);

  const pick = (outcome: string, odds: number, label: string) => {
    const leg: SlipLeg = {
      matchId: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      league: match.league,
      kickoff: match.kickoff,
      market: "1x2",
      marketLabel: market?.label ?? "Match result",
      outcome,
      outcomeLabel: label,
      odds,
    };
    toggle(leg);
  };

  return (
    <article className="w-[210px] shrink-0 rounded-2xl bg-[var(--surface-2)] p-3">
      <div className="flex items-center justify-between gap-1">
        <p className="truncate text-[10px] font-bold text-[var(--text-muted)]">{match.league}</p>
        <time className="shrink-0 text-[10px] font-bold text-[var(--text-faint)]" dateTime={match.kickoff}>
          {kickoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
        </time>
      </div>
      <Link href={`/match/${match.id}`} className="mt-2 block space-y-1.5">
        <Side name={match.homeTeam} crest={match.homeCrest} />
        <Side name={match.awayTeam} crest={match.awayCrest} />
      </Link>
      <div className="mt-2 grid grid-cols-3 text-center">
        {["1", "X", "2"].map((outcome) => {
          const price = market?.prices.find((item) => item.outcome === outcome);
          const isOn = selected?.market === "1x2" && selected?.outcome === outcome;
          return (
            <button
              key={outcome}
              type="button"
              disabled={match.isLocked || !price}
              onClick={() => price && pick(outcome, price.odds, price.label)}
              className="py-1 disabled:opacity-40"
            >
              <span className="block text-[10px] font-bold text-[var(--text-faint)]">{outcome}</span>
              <span
                className="block text-[13px] font-black"
                style={{ color: isOn ? "var(--accent)" : "var(--price)" }}
              >
                {price ? price.odds.toFixed(2) : "—"}
              </span>
            </button>
          );
        })}
      </div>
    </article>
  );
}

function Side({ name, crest }: { name: string; crest: string | null }) {
  return (
    <span className="flex items-center gap-1.5">
      <Image
        src={crest || "/crest-fallback.svg"}
        alt=""
        width={16}
        height={16}
        className="h-4 w-4 object-contain"
        unoptimized
      />
      <span className="truncate text-[11px] font-bold text-[var(--text-bright)]">{name}</span>
    </span>
  );
}
