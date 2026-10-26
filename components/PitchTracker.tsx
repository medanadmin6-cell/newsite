"use client";

import { useEffect, useMemo, useState } from "react";
import type { TrackerEvent } from "@/lib/tracker";

/**
 * The live pitch.
 *
 * An honest note about what this is. Real ball tracking needs a positional feed
 * — coordinates, several times a second — and the fixture provider behind this
 * platform does not sell one. So nothing here pretends to know where the ball
 * is at this instant.
 *
 * What it does show is real: every marker is an actual event at its actual
 * minute, placed at the end the attacking side was shooting into. When a goal
 * lands the ball runs to that end and the net flashes, driven by the event feed
 * rather than by a simulation. Between events it rests on the centre spot,
 * because that is the truthful thing to do when play is not being reported.
 */

interface Props {
  events: TrackerEvent[];
  homeTeam: string;
  awayTeam: string;
  scoreHome: number;
  scoreAway: number;
  minuteLabel: string;
  isLive: boolean;
  possession?: { home: number; away: number } | null;
}

/**
 * Only goals are plotted, and they are stacked in a neat column in front of the
 * net they went into.
 *
 * Plotting every event was tried and thrown away: seventeen markers cycling
 * through a handful of slots overlapped each other and their minute labels
 * collided into an unreadable mess. Goals are few, they are what a pitch view
 * is for, and the full list of events is right below in the timeline.
 */
function goalSpot(side: "home" | "away", indexOnSide: number, countOnSide: number) {
  const x = side === "home" ? 84 : 16;
  // Centre the column vertically however many goals there are.
  const gap = 9;
  const top = 31 - ((countOnSide - 1) * gap) / 2;
  return { x, y: top + indexOnSide * gap };
}

export function PitchTracker({
  events,
  homeTeam,
  awayTeam,
  scoreHome,
  scoreAway,
  minuteLabel,
  isLive,
  possession,
}: Props) {
  const goals = useMemo(() => events.filter((e) => e.kind === "goal"), [events]);
  const latest = events.length ? events[events.length - 1] : null;

  // The ball runs to the end a goal went in at, then returns to the centre.
  // Which goal is being celebrated is derived rather than stored: the only
  // thing state holds is which goal has finished celebrating, set by the timer.
  const lastGoal = goals.length ? goals[goals.length - 1] : null;
  const lastGoalKey = lastGoal ? `${lastGoal.minute}-${lastGoal.side}` : "";
  const [settledKey, setSettledKey] = useState("");

  const celebrating = lastGoal && settledKey !== lastGoalKey ? lastGoal.side : null;
  const ballAt = celebrating
    ? { x: celebrating === "home" ? 92 : 8, y: 50 }
    : { x: 50, y: 50 };

  useEffect(() => {
    if (!lastGoalKey || settledKey === lastGoalKey) return;
    const back = setTimeout(() => setSettledKey(lastGoalKey), 2600);
    return () => clearTimeout(back);
  }, [lastGoalKey, settledKey]);

  const homeShare = possession ? possession.home : 50;

  return (
    <div className="overflow-hidden rounded-[8px] bg-[var(--bg-elevated)]">
      {/* Score strip */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{homeTeam}</span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-[19px] font-black tabular-nums text-[var(--text-bright)]">
            {scoreHome} - {scoreAway}
          </span>
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-black"
            style={{
              background: isLive ? "var(--live)" : "var(--surface-2)",
              color: isLive ? "#fff" : "var(--text-muted)",
            }}
          >
            {isLive ? minuteLabel : "PRE"}
          </span>
        </span>
        <span className="min-w-0 flex-1 truncate text-right text-[12px] font-semibold">{awayTeam}</span>
      </div>

      {/* The pitch */}
      <div className="relative">
        <svg viewBox="0 0 100 62" className="block w-full" role="img" aria-label="Match pitch">
          <defs>
            <linearGradient id="turf" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#16351C" />
              <stop offset="1" stopColor="#0F2415" />
            </linearGradient>
          </defs>

          <rect width="100" height="62" fill="url(#turf)" />

          {/* Mown stripes */}
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <rect
              key={i}
              x={i * 12.5}
              width="12.5"
              height="62"
              fill="#FFFFFF"
              opacity={i % 2 ? 0.028 : 0}
            />
          ))}

          {/* Possession territory, only where the feed reports it */}
          {possession && (
            <>
              <rect x="0" y="0" width={homeShare} height="62" fill="var(--accent)" opacity=".07" />
              <rect
                x={homeShare}
                y="0"
                width={100 - homeShare}
                height="62"
                fill="var(--hint)"
                opacity=".07"
              />
            </>
          )}

          <g stroke="#FFFFFF" strokeOpacity=".38" strokeWidth="0.4" fill="none">
            <rect x="2" y="2" width="96" height="58" />
            <line x1="50" y1="2" x2="50" y2="60" />
            <circle cx="50" cy="31" r="8.5" />
            <rect x="2" y="14" width="12" height="34" />
            <rect x="86" y="14" width="12" height="34" />
            <rect x="2" y="23" width="5" height="16" />
            <rect x="93" y="23" width="5" height="16" />
          </g>
          <circle cx="50" cy="31" r="0.7" fill="#FFFFFF" fillOpacity=".5" />

          {/* Nets flash when a goal goes in at that end */}
          <rect
            x="0.5"
            y="23"
            width="1.8"
            height="16"
            fill="var(--accent)"
            opacity={celebrating === "away" ? 0.9 : 0.18}
            className={celebrating === "away" ? "live-dot" : undefined}
          />
          <rect
            x="97.7"
            y="23"
            width="1.8"
            height="16"
            fill="var(--accent)"
            opacity={celebrating === "home" ? 0.9 : 0.18}
            className={celebrating === "home" ? "live-dot" : undefined}
          />

          {/* Goals, at the end they went in */}
          {(["home", "away"] as const).flatMap((side) => {
            const own = goals.filter((g) => g.side === side);
            return own.map((g, i) => {
              const spot = goalSpot(side, i, own.length);
              return (
                <g key={`${side}-${g.minute}-${i}`}>
                  <circle cx={spot.x} cy={spot.y} r="2.2" fill="var(--accent)" />
                  <text
                    x={side === "home" ? spot.x - 4 : spot.x + 4}
                    y={spot.y + 1}
                    textAnchor={side === "home" ? "end" : "start"}
                    fontSize="3"
                    fontWeight="700"
                    fill="#FFFFFF"
                    fillOpacity=".85"
                  >
                    {g.minute}
                  </text>
                </g>
              );
            });
          })}

          {/* The ball. It moves on a real goal, and otherwise rests. */}
          <circle
            cx={ballAt.x}
            cy={(ballAt.y / 100) * 62}
            r="1.7"
            fill="#FFFFFF"
            style={{ transition: "cx 900ms ease-in-out, cy 900ms ease-in-out" }}
          />
        </svg>

        {celebrating && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-[15px] font-black text-[var(--accent-ink)]">
              GOAL
            </span>
          </span>
        )}
      </div>

      {/* Possession, when it is reported */}
      {possession ? (
        <div className="px-3 py-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-[var(--accent)]">{possession.home}%</span>
            <span className="text-[var(--text-muted)]">Possession</span>
            <span className="font-bold text-[var(--hint)]">{possession.away}%</span>
          </div>
          <div className="mt-1 flex h-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <span className="h-full bg-[var(--accent)]" style={{ width: `${homeShare}%` }} />
            <span className="h-full bg-[var(--hint)]" style={{ width: `${100 - homeShare}%` }} />
          </div>
        </div>
      ) : (
        <p className="px-3 py-2 text-[10px] leading-relaxed text-[var(--text-faint)]">
          Markers are real events at their real minute. Live possession is not reported for this
          match, and the ball is not positionally tracked — it moves when a goal goes in.
        </p>
      )}

      {latest && (
        <p className="border-t border-[var(--line)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
          Latest:{" "}
          <span className="font-semibold text-[var(--text)]">
            {latest.minute}&apos; {latest.detail}
            {latest.player ? ` — ${latest.player}` : ""}
          </span>{" "}
          <span className="text-[var(--text-faint)]">
            ({latest.side === "home" ? homeTeam : awayTeam})
          </span>
        </p>
      )}
    </div>
  );
}
