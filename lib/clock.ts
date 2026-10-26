/**
 * The match clock.
 *
 * The upstream feed reports whole minutes and lags, so the ticking clock is
 * derived from the kickoff timestamp instead. One function decides the minute,
 * whether a match is live, which half is running and when it is over — so the
 * displayed clock, the lock rules and settlement can never disagree.
 */

export type Phase = "pre" | "first" | "ht" | "second" | "ft";

export interface MatchClock {
  phase: Phase;
  /** Minute within regulation time, 0-90 for football. */
  minute: number;
  /** "12:34", "HT", "FT" or the kickoff time label. */
  label: string;
  isLive: boolean;
  isOver: boolean;
}

const HALF = 45;
const BREAK = 15;

/** Regulation length per sport, in minutes of a single running period. */
const REGULATION: Record<string, { half: number; halves: number; breakLen: number }> = {
  football: { half: 45, halves: 2, breakLen: 15 },
  basketball: { half: 24, halves: 2, breakLen: 15 },
  tennis: { half: 60, halves: 2, breakLen: 5 },
  hockey: { half: 30, halves: 2, breakLen: 15 },
};

export function matchClock(kickoff: string | Date, sport = "football", now = new Date()): MatchClock {
  const ko = typeof kickoff === "string" ? new Date(kickoff) : kickoff;
  const reg = REGULATION[sport] ?? REGULATION.football;
  const elapsedMs = now.getTime() - ko.getTime();
  const elapsed = Math.floor(elapsedMs / 60000);

  if (elapsed < 0) {
    return {
      phase: "pre",
      minute: 0,
      isLive: false,
      isOver: false,
      label: ko.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
  }

  if (elapsed < reg.half) {
    const secs = Math.floor(elapsedMs / 1000) % 60;
    return {
      phase: "first",
      minute: elapsed,
      isLive: true,
      isOver: false,
      label: `${elapsed}:${String(secs).padStart(2, "0")}`,
    };
  }

  if (elapsed < reg.half + reg.breakLen) {
    return { phase: "ht", minute: reg.half, isLive: true, isOver: false, label: "HT" };
  }

  const full = reg.half * reg.halves + reg.breakLen;
  if (elapsed < full) {
    const inSecond = elapsed - reg.breakLen;
    const secs = Math.floor(elapsedMs / 1000) % 60;
    return {
      phase: "second",
      minute: inSecond,
      isLive: true,
      isOver: false,
      label: `${inSecond}:${String(secs).padStart(2, "0")}`,
    };
  }

  return {
    phase: "ft",
    minute: reg.half * reg.halves,
    isLive: false,
    isOver: true,
    label: "FT",
  };
}

/** Score implied by a scripted goal timeline at the current clock minute. */
export function scoreFromTimeline(
  timeline: { minute: number; team: "home" | "away" }[],
  clock: MatchClock,
): { home: number; away: number } {
  const cutoff = clock.isOver ? Number.POSITIVE_INFINITY : clock.minute;
  let home = 0;
  let away = 0;
  for (const g of timeline ?? []) {
    if (g.minute <= cutoff) {
      if (g.team === "home") home++;
      else away++;
    }
  }
  return { home, away };
}

export const HALF_LENGTH = HALF;
export const BREAK_LENGTH = BREAK;
