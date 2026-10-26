/**
 * Odds helpers: markets derived from 1X2 when the upstream feed did not price
 * them, and the live drift applied to operator-scripted custom matches.
 */

export interface Price {
  outcome: string;
  label: string;
  odds: number;
}

/** Filter groups on the match details page. */
export type MarketGroup =
  | "main"
  | "goals"
  | "half"
  | "handicap"
  | "corners"
  | "teams"
  | "specials";

export interface Market {
  key: string;
  label: string;
  group: MarketGroup;
  /** Shown as a badge beside the title, the way boosted variants are marked. */
  badge?: string;
  /** Many-outcome markets (correct score) render as a compact grid. */
  dense?: boolean;
  prices: Price[];
}

const round = (n: number) => Math.max(1.01, Math.round(n * 100) / 100);

/**
 * Implied probabilities from 1X2, normalised so the overround is stripped
 * before anything is derived from them.
 */
function implied(h: number, d: number, a: number) {
  const ph = 1 / h;
  const pd = 1 / d;
  const pa = 1 / a;
  const total = ph + pd + pa;
  return { h: ph / total, d: pd / total, a: pa / total };
}

/** Margin the book keeps on derived markets. */
const MARGIN = 1.06;

const price = (p: number) => round(1 / Math.min(0.97, Math.max(0.03, p * MARGIN)));

/**
 * Build the full market set from 1X2 alone, so the market selector always has
 * something to show even when upstream priced only the match result.
 */
export function deriveMarkets(h: number, d: number, a: number): Market[] {
  const p = implied(h, d, a);

  // Double chance is the exact sum of the legs it covers.
  const dc1x = p.h + p.d;
  const dcx2 = p.d + p.a;
  const dc12 = p.h + p.a;

  // Draw-no-bet renormalises across the two win outcomes.
  const dnbTotal = p.h + p.a;
  const dnbH = p.h / dnbTotal;
  const dnbA = p.a / dnbTotal;

  // A tight game (high draw probability) implies fewer goals. This is a
  // heuristic, not a real goals model — it exists so the selector is populated.
  const goalIndex = 1 - p.d * 1.6;
  const over25 = Math.min(0.82, Math.max(0.18, goalIndex));
  const over15 = Math.min(0.93, over25 + 0.22);
  const bttsYes = Math.min(0.85, Math.max(0.2, over25 * 0.95));

  return [
    {
      key: "1x2",
      group: "main",
      label: "Match result",
      prices: [
        { outcome: "1", label: "Home", odds: round(h) },
        { outcome: "X", label: "Draw", odds: round(d) },
        { outcome: "2", label: "Away", odds: round(a) },
      ],
    },
    {
      key: "dc",
      group: "main",
      label: "Double chance",
      prices: [
        { outcome: "1X", label: "Home or draw", odds: price(dc1x) },
        { outcome: "12", label: "Home or away", odds: price(dc12) },
        { outcome: "X2", label: "Draw or away", odds: price(dcx2) },
      ],
    },
    {
      key: "dnb",
      group: "main",
      label: "Draw no bet",
      prices: [
        { outcome: "DNB1", label: "Home", odds: price(dnbH) },
        { outcome: "DNB2", label: "Away", odds: price(dnbA) },
      ],
    },
    {
      key: "ou25",
      group: "goals",
      label: "Total goals 2.5",
      prices: [
        { outcome: "O2.5", label: "Over 2.5", odds: price(over25) },
        { outcome: "U2.5", label: "Under 2.5", odds: price(1 - over25) },
      ],
    },
    {
      key: "ou15",
      group: "goals",
      label: "Total goals 1.5",
      prices: [
        { outcome: "O1.5", label: "Over 1.5", odds: price(over15) },
        { outcome: "U1.5", label: "Under 1.5", odds: price(1 - over15) },
      ],
    },
    {
      key: "btts",
      group: "goals",
      label: "Both teams to score",
      prices: [
        { outcome: "GG", label: "Yes", odds: price(bttsYes) },
        { outcome: "NG", label: "No", odds: price(1 - bttsYes) },
      ],
    },
  ];
}

/**
 * Live drift on operator-scripted matches. The team in front shortens and the
 * team behind drifts, and the swing grows both with the size of the lead and
 * with how late it is in the match.
 *
 * This is presentational drama only. Live betting is locked, so no ticket is
 * ever struck at a drifted price.
 */
export function driftOdds(
  base: { home: number; draw: number; away: number },
  score: { home: number; away: number },
  minute: number,
): { home: number; draw: number; away: number } {
  const lead = score.home - score.away;
  const lateness = Math.min(1, Math.max(0, minute / 90));

  if (lead === 0) {
    // A goalless or level game late on shortens the draw hard.
    const drawPull = 1 - 0.45 * lateness;
    return {
      home: round(base.home * (1 + 0.35 * lateness)),
      draw: round(base.draw * drawPull),
      away: round(base.away * (1 + 0.35 * lateness)),
    };
  }

  const magnitude = Math.min(1, Math.abs(lead) / 3);
  const swing = 0.15 + 0.7 * magnitude * lateness;

  const leaderFactor = Math.max(0.05, 1 - swing);
  const trailerFactor = 1 + swing * 3.2;
  const drawFactor = 1 + swing * 1.4;

  return lead > 0
    ? {
        home: round(base.home * leaderFactor),
        draw: round(base.draw * drawFactor),
        away: round(base.away * trailerFactor),
      }
    : {
        home: round(base.home * trailerFactor),
        draw: round(base.draw * drawFactor),
        away: round(base.away * leaderFactor),
      };
}

/** BEST ODDS boost the operator can flag on a custom match. */
export function applyBoost(odds: number, boosted: boolean): number {
  return boosted ? round(odds * 1.15) : round(odds);
}
