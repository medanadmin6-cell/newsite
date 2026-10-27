"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Dices,
  Settings,
  Grid2x2,
  Ticket,
  Trophy,
  Zap,
} from "lucide-react";
import { Page } from "@/components/Shell";
import { MatchList } from "@/components/MatchList";
import { BetSlip } from "@/components/BetSlip";
import { SupportChat } from "@/components/SupportChat";
import { useSlip, type SlipLeg } from "@/lib/store";
import type { FeedMatch } from "@/lib/fixtures";

const POLL_MS = 30_000;

const ACTIONS = [
  { label: "Soccer", href: "/?tab=football", Icon: Trophy },
  { label: "Today", href: "/?tab=today", Icon: Calendar },
  { label: "Odds Filter", href: "/?tab=boosted", Icon: Settings },
  { label: "Instant Virtuals", href: "/virtuals", Icon: Zap },
  { label: "Booking Codes", href: "/load-code", Icon: Ticket },
  { label: "ALL", href: "/az", Icon: Grid2x2 },
];

const LIVE_SPORTS = [
  { key: "soccer", label: "Soccer" },
  { key: "vsoccer", label: "V-Soccer" },
  { key: "esoccer", label: "ESports Soccer" },
  { key: "basketball", label: "Basketball" },
];

const GAMES = [
  { name: "Aviator", tag: "HOT", mult: "8.42x", image: "/games/aviator.jpg" },
  { name: "Mines", tag: "", mult: "5.24x", image: "/games/mines.jpg" },
  { name: "Crash", tag: "", mult: "", image: "/games/crash.jpg" },
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
        <Link
          href="/games"
          className="relative block h-[168px] overflow-hidden rounded-2xl bg-[#14061f] text-white"
        >
          <Image
            src="/games/aviator.jpg"
            alt="Red plane climbing through a night sky"
            fill
            sizes="100vw"
            className="object-cover object-right"
            priority
          />
          <span className="absolute inset-0 bg-gradient-to-r from-[#14061f] via-[#14061f]/75 to-transparent" />
          <span className="relative block px-4 py-4">
            <p className="text-[11px] font-black tracking-[0.14em] text-white/70">AVIATOR</p>
            <p className="mt-1 text-[22px] font-black leading-none">FLY HIGH, WIN BIG</p>
            <p className="mt-1 max-w-[180px] text-[11px] text-white/70">
              Cash out before the lucky plane flies away!
            </p>
            <p className="mt-3 text-[28px] font-black text-[#ff4d6d]">18.75x</p>
          </span>
        </Link>

        <div className="grid grid-cols-6 gap-1.5 rounded-2xl bg-white px-1 py-3 shadow-sm">
          {ACTIONS.map((action) => (
            <Link key={action.label} href={action.href} className="flex flex-col items-center gap-1.5 text-center">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e7efff] text-[var(--accent)]">
                <action.Icon size={16} strokeWidth={2} />
              </span>
              <span className="text-[9px] font-semibold leading-tight text-[var(--text-muted)]">{action.label}</span>
            </Link>
          ))}
        </div>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-[13px] font-black tracking-wide text-[var(--text-bright)]">
              <Dices size={14} className="text-[var(--accent)]" />
              CASINO GAMES
            </h2>
            <Link href="/games" className="text-[12px] font-bold text-[var(--text-muted)]">
              More &gt;
            </Link>
          </div>
          <div className="scroll-x flex gap-2">
            {GAMES.map((game) => (
              <Link
                key={game.name}
                href="/games"
                className="relative h-[92px] w-[148px] shrink-0 overflow-hidden rounded-xl text-white"
              >
                <Image src={game.image} alt="" fill sizes="148px" className="object-cover" />
                <span className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/35 to-black/10" />
                <span className="relative flex h-full flex-col p-3">
                  {game.tag ? (
                    <span className="w-fit rounded bg-[#ff4d6d] px-1.5 py-0.5 text-[9px] font-black">{game.tag}</span>
                  ) : (
                    <span className="h-[16px]" />
                  )}
                  <p className="mt-1 text-[14px] font-black">{game.name}</p>
                  {game.mult && <p className="text-[12px] font-bold text-white/90">{game.mult}</p>}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-[13px] font-black tracking-wide">
              <Trophy size={14} className="text-[var(--accent)]" />
              FEATURED MATCHES
            </h2>
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
              <Link href="/?tab=boosted" className="ml-1 text-[11px] font-black text-[var(--accent)]">
                BEST ODDS
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

        <section className="rounded-2xl bg-white p-3 shadow-sm">
          <div className="scroll-x flex items-center gap-4">
            <span className="flex shrink-0 items-center gap-1 text-[13px] font-black text-[var(--accent)]">
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
          <p className="mt-3 text-[13px] font-bold text-[var(--text-bright)]">In-Play Matches</p>
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
    <article className="w-[168px] shrink-0 rounded-xl border border-[var(--line)] bg-white p-2.5">
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
