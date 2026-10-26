"use client";

import Image from "next/image";
import Link from "next/link";
import { Lock } from "lucide-react";
import { useSlip, type SlipLeg } from "@/lib/store";
import type { FeedMatch } from "@/lib/fixtures";

/**
 * The featured match carousel.
 *
 * A wider treatment than the board row: crests and team names on either side, a
 * kickoff column between them, and three full-width outcome buttons where the
 * label sits left and the price sits right in the accent.
 */
export function FeaturedMatches({ matches }: { matches: FeedMatch[] }) {
  if (!matches.length) return null;

  return (
    <div className="scroll-x flex snap-x snap-mandatory gap-2 px-2.5 pb-1 md:gap-3 md:px-5">
      {matches.map((m) => (
        <FeaturedCard key={m.id} match={m} />
      ))}
    </div>
  );
}

function FeaturedCard({ match }: { match: FeedMatch }) {
  const toggle = useSlip((s) => s.toggle);
  const legs = useSlip((s) => s.legs);

  const market = match.markets.find((m) => m.key === "1x2");
  const selected = legs.find((l) => l.matchId === match.id);
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
    <article
      className="w-[300px] shrink-0 snap-start overflow-hidden rounded-[8px] p-3 md:w-[380px] md:p-4"
      style={{ background: "linear-gradient(135deg, #06464B 0%, #043034 60%)" }}
    >
      <Link href={`/match/${match.id}`} className="block">
        <p className="truncate text-[11px] text-[var(--text-muted)]">
          {match.country} - {match.league}
        </p>
      </Link>

      <div className="mt-2.5 flex items-start justify-between gap-1">
        <Side name={match.homeTeam} crest={match.homeCrest} href={`/match/${match.id}`} />

        <div className="flex shrink-0 flex-col items-center gap-1 pt-1.5">
          {match.isLive ? (
            <span className="text-[12px] font-bold text-[var(--live)]">{match.minuteLabel}</span>
          ) : (
            <span className="text-[12px] font-medium text-[var(--text)]">
              {kickoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
              {" | "}
              {kickoff.toLocaleDateString([], { day: "2-digit", month: "2-digit" })}
            </span>
          )}
          <span className="text-[11px] font-bold text-[var(--accent)]">1X2</span>
        </div>

        <Side name={match.awayTeam} crest={match.awayCrest} href={`/match/${match.id}`} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {["1", "X", "2"].map((outcome) => {
          const price = market?.prices.find((p) => p.outcome === outcome);
          const isOn = selected?.market === "1x2" && selected?.outcome === outcome;
          const disabled = match.isLocked || !price;

          return (
            <button
              key={outcome}
              disabled={disabled}
              onClick={() => price && pick(outcome, price.odds, price.label)}
              className="flex h-[40px] items-center justify-between rounded-[4px] px-3 disabled:opacity-40 md:h-[46px] md:px-4"
              style={{
                background: isOn ? "var(--accent)" : "var(--surface-3)",
                color: isOn ? "var(--accent-ink)" : "var(--text-muted)",
              }}
              aria-label={`${match.homeTeam} v ${match.awayTeam}, ${outcome}, ${price?.odds ?? "unavailable"}`}
            >
              <span className="text-[13px] font-medium">{outcome}</span>
              <span
                className="text-[15px] font-black"
                style={{ color: isOn ? "var(--accent-ink)" : "var(--accent)" }}
              >
                {match.isLocked ? <Lock size={14} strokeWidth={2} /> : price ? price.odds.toFixed(2) : "—"}
              </span>
            </button>
          );
        })}
      </div>
    </article>
  );
}

function Side({ name, crest, href }: { name: string; crest: string | null; href: string }) {
  return (
    <Link href={href} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
      <Image
        src={crest || "/crest-fallback.svg"}
        alt=""
        width={40}
        height={40}
        className="h-10 w-10 object-contain"
        unoptimized
      />
      <span className="line-clamp-2 text-center text-[12px] font-bold leading-tight text-[var(--text-bright)]">
        {name}
      </span>
    </Link>
  );
}
