import type { MatchResult } from "./results";

/**
 * Judging a settled leg.
 *
 * Every judge returns true (won), false (lost) or null (cannot decide). Null is
 * the safe answer and always the default: an unrecognised market, a missing
 * half-time score or an unparsable outcome leaves the leg pending for the
 * operator rather than being guessed at. Settling a leg wrongly moves real
 * money out of, or into, a player's wallet.
 *
 * Market keys are `af<betId>` from API-Football, plus `1x2` for the derived
 * market used on operator-created fixtures.
 */

type Verdict = boolean | null;
type Side = "home" | "draw" | "away";

// --------------------------------------------------------------- utilities

/** Home / Draw / Away, 1 / X / 2, and the team names all mean the same thing. */
function side(value: string): Side | null {
  switch (value.trim().toLowerCase()) {
    case "1":
    case "home":
      return "home";
    case "x":
    case "draw":
      return "draw";
    case "2":
    case "away":
      return "away";
    default:
      return null;
  }
}

function resultOf(h: number, a: number): Side {
  return h > a ? "home" : h < a ? "away" : "draw";
}

/** Pull the numeric line out of "Over 2.5", "Under 1.75", "Home -1.5". */
function line(value: string): number | null {
  const m = value.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Over/Under against a line, including the quarter lines (1.75, 2.25) where a
 * stake is split between two whole lines and can half-win or half-lose. Those
 * push cases cannot be expressed as won/lost, so they stay pending.
 */
function overUnder(total: number, value: string): Verdict {
  const l = line(value);
  if (l === null) return null;

  const isOver = /over|^o[\s/]/i.test(value);
  const isUnder = /under|^u[\s/]/i.test(value);
  if (!isOver && !isUnder) return null;

  // A whole line that lands exactly is a push — money back, not a win or a
  // loss — and this schema has no push state, so leave it to the operator.
  if (Number.isInteger(l) && total === l) return null;

  // Quarter lines split the stake; the same limitation applies.
  const frac = Math.abs(l % 1);
  if (Math.abs(frac - 0.25) < 1e-9 || Math.abs(frac - 0.75) < 1e-9) return null;

  return isOver ? total > l : total < l;
}

function yesNo(value: string, actual: boolean): Verdict {
  const v = value.trim().toLowerCase();
  if (v === "yes") return actual;
  if (v === "no") return !actual;
  return null;
}

/** "2:1" or "2-1". */
function scoreline(value: string): { h: number; a: number } | null {
  const m = value.trim().match(/^(\d+)\s*[:\-–]\s*(\d+)$/);
  if (!m) return null;
  return { h: Number(m[1]), a: Number(m[2]) };
}

function haveHalfTime(r: MatchResult): r is MatchResult & { htHome: number; htAway: number } {
  return r.htHome !== null && r.htAway !== null;
}

function haveCorners(r: MatchResult): r is MatchResult & { cornersHome: number; cornersAway: number } {
  return r.cornersHome !== null && r.cornersAway !== null;
}

// ------------------------------------------------------------- the registry

type Judge = (outcome: string, r: MatchResult) => Verdict;

const JUDGES: Record<string, Judge> = {
  // --- Match result ------------------------------------------------------
  "1x2": (o, r) => {
    const s = side(o);
    return s === null ? null : s === resultOf(r.home, r.away);
  },
  af1: (o, r) => {
    const s = side(o);
    return s === null ? null : s === resultOf(r.home, r.away);
  },

  // Home/Away is draw-no-bet: a draw voids, which this schema cannot express.
  af2: (o, r) => {
    const s = side(o);
    if (s === null || s === "draw") return null;
    if (r.home === r.away) return null;
    return s === resultOf(r.home, r.away);
  },

  // --- Double chance ----------------------------------------------------
  af12: (o, r) => doubleChance(o, resultOf(r.home, r.away)),

  // --- Goals ------------------------------------------------------------
  af5: (o, r) => overUnder(r.home + r.away, o),
  af50: (o, r) => overUnder(r.home + r.away, o), // Goal Line
  af8: (o, r) => yesNo(o, r.home > 0 && r.away > 0),
  af21: (o, r) => oddEven(o, r.home + r.away),
  af23: (o, r) => oddEven(o, r.home),
  af60: (o, r) => oddEven(o, r.away),
  af38: (o, r) => {
    const n = line(o);
    return n === null ? null : r.home + r.away === n;
  },

  // --- Correct score ----------------------------------------------------
  af10: (o, r) => correctScore(o, r),

  // The derived scoreline markets on operator fixtures.
  cs: (o, r) => correctScore(o, r),
  oe: (o, r) => oddEven(o, r.home + r.away),
  eg: (o, r) => {
    const total = r.home + r.away;
    if (/^\d+\+$/.test(o.trim())) return total >= Number(o.trim().replace("+", ""));
    const n = line(o);
    return n === null ? null : total === n;
  },

  // --- Team goals -------------------------------------------------------
  af16: (o, r) => overUnder(r.home, o), // Total - Home
  af17: (o, r) => overUnder(r.away, o), // Total - Away
  af27: (o, r) => yesNo(o, r.away === 0), // Clean Sheet - Home
  af28: (o, r) => yesNo(o, r.home === 0), // Clean Sheet - Away
  af43: (o, r) => yesNo(o, r.home > 0), // Home Team Score a Goal
  af44: (o, r) => yesNo(o, r.away > 0), // Away Team Score a Goal
  af29: (o, r) => yesNo(o, r.home > r.away && r.away === 0), // Win to Nil - Home
  af30: (o, r) => yesNo(o, r.away > r.home && r.home === 0), // Win to Nil - Away
  af36: (o, r) => {
    // Win To Nil, expressed by side.
    const s = side(o);
    if (s === null || s === "draw") return null;
    return s === "home" ? r.home > r.away && r.away === 0 : r.away > r.home && r.home === 0;
  },
  af110: (o, r) => yesNo(o, r.home === r.away && r.home > 0), // Scoring Draw

  // --- Combination ------------------------------------------------------
  af24: (o, r) => resultAndBtts(o, r), // Results/Both Teams Score
  af49: (o, r) => totalAndBtts(o, r), // Total Goals/Both Teams To Score

  // --- Handicap ---------------------------------------------------------
  af9: (o, r) => handicapResult(o, r), // Handicap Result

  // --- Half markets -----------------------------------------------------
  af13: (o, r) => (haveHalfTime(r) ? sideJudge(o, resultOf(r.htHome, r.htAway)) : null),
  af6: (o, r) => (haveHalfTime(r) ? overUnder(r.htHome + r.htAway, o) : null),
  af34: (o, r) => (haveHalfTime(r) ? yesNo(o, r.htHome > 0 && r.htAway > 0) : null),
  af22: (o, r) => (haveHalfTime(r) ? oddEven(o, r.htHome + r.htAway) : null),
  af46: (o, r) => {
    if (!haveHalfTime(r)) return null;
    const n = line(o);
    return n === null ? null : r.htHome + r.htAway === n;
  },
  af20: (o, r) => (haveHalfTime(r) ? doubleChance(o, resultOf(r.htHome, r.htAway)) : null),
  af105: (o, r) => (haveHalfTime(r) ? overUnder(r.htHome, o) : null),
  af106: (o, r) => (haveHalfTime(r) ? overUnder(r.htAway, o) : null),
  af109: (o, r) => {
    if (!haveHalfTime(r)) return null;
    const s = side(o);
    if (s === null || s === "draw") return null;
    if (r.htHome === r.htAway) return null;
    return s === resultOf(r.htHome, r.htAway);
  },

  // Second half is the difference between full time and half time.
  af3: (o, r) => (haveHalfTime(r) ? sideJudge(o, resultOf(r.home - r.htHome, r.away - r.htAway)) : null),
  af26: (o, r) => (haveHalfTime(r) ? overUnder(r.home - r.htHome + (r.away - r.htAway), o) : null),
  af35: (o, r) => (haveHalfTime(r) ? yesNo(o, r.home - r.htHome > 0 && r.away - r.htAway > 0) : null),
  af63: (o, r) => (haveHalfTime(r) ? oddEven(o, r.home - r.htHome + (r.away - r.htAway)) : null),
  af33: (o, r) =>
    haveHalfTime(r) ? doubleChance(o, resultOf(r.home - r.htHome, r.away - r.htAway)) : null,
  af107: (o, r) => (haveHalfTime(r) ? overUnder(r.home - r.htHome, o) : null),
  af108: (o, r) => (haveHalfTime(r) ? overUnder(r.away - r.htAway, o) : null),
  af31: (o, r) => {
    if (!haveHalfTime(r)) return null;
    const s = scoreline(o);
    return s === null ? null : s.h === r.htHome && s.a === r.htAway;
  },

  af7: (o, r) => htFt(o, r), // HT/FT Double
  af11: (o, r) => highestScoringHalf(o, r),
  af32: (o, r) => winBothHalves(o, r),
  af39: (o, r) => winEitherHalf(o, r),
  af111: (o, r) => (haveHalfTime(r) ? yesNo(o, r.htHome > 0 && r.home - r.htHome > 0) : null),
  af112: (o, r) => (haveHalfTime(r) ? yesNo(o, r.htAway > 0 && r.away - r.htAway > 0) : null),

  // --- Corners ----------------------------------------------------------
  af45: (o, r) => (haveCorners(r) ? overUnder(r.cornersHome + r.cornersAway, o) : null),
  af55: (o, r) => (haveCorners(r) ? sideJudge(o, resultOf(r.cornersHome, r.cornersAway)) : null),
  af57: (o, r) => (haveCorners(r) ? overUnder(r.cornersHome, o) : null),
  af58: (o, r) => (haveCorners(r) ? overUnder(r.cornersAway, o) : null),
  af85: (o, r) => (haveCorners(r) ? sideJudge(o, resultOf(r.cornersHome, r.cornersAway)) : null),
  af338: (o, r) => (haveCorners(r) ? oddEven(o, r.cornersHome + r.cornersAway) : null),
  af339: (o, r) => (haveCorners(r) ? doubleChance(o, resultOf(r.cornersHome, r.cornersAway)) : null),
};

// --------------------------------------------------------- family helpers

/**
 * A correct-score leg. "Any other" is the catch-all outside the quoted grid, so
 * it wins exactly when no quoted scoreline did.
 */
function correctScore(o: string, r: MatchResult): Verdict {
  const v = o.trim().toLowerCase();
  if (v === "any other") return r.home > 6 || r.away > 6;

  const s = scoreline(o);
  return s === null ? null : s.h === r.home && s.a === r.away;
}

function sideJudge(o: string, actual: Side): Verdict {
  const s = side(o);
  return s === null ? null : s === actual;
}

function oddEven(o: string, total: number): Verdict {
  const v = o.trim().toLowerCase();
  if (v === "odd") return total % 2 === 1;
  if (v === "even") return total % 2 === 0;
  return null;
}

function doubleChance(o: string, actual: Side): Verdict {
  const v = o.trim().toLowerCase().replace(/\s/g, "");
  const covers: Record<string, Side[]> = {
    "home/draw": ["home", "draw"],
    "1x": ["home", "draw"],
    "home/away": ["home", "away"],
    "12": ["home", "away"],
    "draw/away": ["draw", "away"],
    x2: ["draw", "away"],
  };
  const set = covers[v];
  return set ? set.includes(actual) : null;
}

function resultAndBtts(o: string, r: MatchResult): Verdict {
  // "Home/Yes", "Draw/No", …
  const parts = o.split("/").map((p) => p.trim());
  if (parts.length !== 2) return null;
  const s = side(parts[0]);
  const btts = yesNo(parts[1], r.home > 0 && r.away > 0);
  if (s === null || btts === null) return null;
  return s === resultOf(r.home, r.away) && btts;
}

function totalAndBtts(o: string, r: MatchResult): Verdict {
  // "o/yes 2.5", "u/no 2.5"
  const m = o.trim().match(/^([ou])\/(yes|no)\s+([\d.]+)$/i);
  if (!m) return null;
  const total = r.home + r.away;
  const l = Number(m[3]);
  if (!Number.isFinite(l) || (Number.isInteger(l) && total === l)) return null;
  const overOk = m[1].toLowerCase() === "o" ? total > l : total < l;
  const bttsOk = m[2].toLowerCase() === "yes" ? r.home > 0 && r.away > 0 : !(r.home > 0 && r.away > 0);
  return overOk && bttsOk;
}

function handicapResult(o: string, r: MatchResult): Verdict {
  // "Home -1", "Away -1", "Draw -1" — the handicap applies to the home side.
  const parts = o.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const s = side(parts[0]);
  const h = Number(parts[1]);
  if (s === null || !Number.isFinite(h)) return null;

  const adjusted = resultOf(r.home + h, r.away);
  return s === adjusted;
}

function htFt(o: string, r: MatchResult): Verdict {
  if (!haveHalfTime(r)) return null;
  const parts = o.split("/").map((p) => p.trim());
  if (parts.length !== 2) return null;
  const first = side(parts[0]);
  const second = side(parts[1]);
  if (first === null || second === null) return null;
  return first === resultOf(r.htHome, r.htAway) && second === resultOf(r.home, r.away);
}

function highestScoringHalf(o: string, r: MatchResult): Verdict {
  if (!haveHalfTime(r)) return null;
  const firstHalf = r.htHome + r.htAway;
  const secondHalf = r.home + r.away - firstHalf;
  const v = o.trim().toLowerCase();
  if (v.includes("1st") || v.includes("first")) return firstHalf > secondHalf;
  if (v.includes("2nd") || v.includes("second")) return secondHalf > firstHalf;
  if (v.includes("equal") || v.includes("draw") || v.includes("tie")) return firstHalf === secondHalf;
  return null;
}

function winBothHalves(o: string, r: MatchResult): Verdict {
  if (!haveHalfTime(r)) return null;
  const s = side(o);
  if (s === null || s === "draw") return null;
  const h1 = resultOf(r.htHome, r.htAway);
  const h2 = resultOf(r.home - r.htHome, r.away - r.htAway);
  return h1 === s && h2 === s;
}

function winEitherHalf(o: string, r: MatchResult): Verdict {
  if (!haveHalfTime(r)) return null;
  const s = side(o);
  if (s === null || s === "draw") return null;
  const h1 = resultOf(r.htHome, r.htAway);
  const h2 = resultOf(r.home - r.htHome, r.away - r.htAway);
  return h1 === s || h2 === s;
}

// ------------------------------------------------------------------ public

/** Markets that need corner counts, so settlement knows when to fetch them. */
export const CORNER_MARKETS = new Set(["af45", "af55", "af57", "af58", "af85", "af338", "af339"]);

export function canJudge(marketKey: string): boolean {
  return marketKey in JUDGES;
}

/**
 * Judge one leg. Returns null whenever the market is unknown, the data needed
 * is missing, or the outcome cannot be parsed — the leg then stays pending.
 */
export function judge(marketKey: string, outcome: string, result: MatchResult): Verdict {
  if (!result.finished) return null;
  const fn = JUDGES[marketKey];
  if (!fn) return null;
  try {
    return fn(outcome, result);
  } catch (err) {
    console.error("[judge] threw", marketKey, outcome, err);
    return null;
  }
}

export const JUDGED_MARKET_COUNT = Object.keys(JUDGES).length;
