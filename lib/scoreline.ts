import type { Market, Price } from "./odds";

/**
 * Correct score, and the goal markets that fall out of it, for operator
 * fixtures.
 *
 * Upstream fixtures get real correct-score prices from the book. Operator
 * matches have only a 1X2 price, so the scoreline distribution is derived from
 * it: fit a Poisson goal rate to each side such that the model reproduces the
 * operator's own home/draw/away probabilities, then read every scoreline off
 * that fitted model.
 *
 * The point of fitting rather than inventing is coherence. A 2-0 quoted here
 * agrees with the 1X2, the over/under and the both-teams-to-score prices on the
 * same match, so a player cannot arbitrage one market against another.
 */

const MAX_GOALS = 6; // Scorelines above this collapse into "Any other".
const MARGIN = 1.08; // The book's cut on derived scoreline prices.

/** Poisson probability of exactly k events at rate lambda. */
function poisson(k: number, lambda: number): number {
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / fact;
}

interface Rates {
  home: number;
  away: number;
}

/** Home/draw/away probabilities implied by a pair of goal rates. */
function outcomeProbs(r: Rates): { h: number; d: number; a: number } {
  let h = 0;
  let d = 0;
  let a = 0;

  for (let i = 0; i <= 12; i++) {
    const ph = poisson(i, r.home);
    for (let j = 0; j <= 12; j++) {
      const p = ph * poisson(j, r.away);
      if (i > j) h += p;
      else if (i === j) d += p;
      else a += p;
    }
  }
  return { h, d, a };
}

const fitCache = new Map<string, Rates>();

/**
 * Find the goal rates whose Poisson model best reproduces the given 1X2
 * probabilities. Coarse sweep, then a fine pass around the winner — fast enough
 * to run per fixture, and memoised on the rounded price anyway.
 */
function fitRates(pH: number, pD: number, pA: number): Rates {
  const key = `${pH.toFixed(3)}:${pD.toFixed(3)}:${pA.toFixed(3)}`;
  const cached = fitCache.get(key);
  if (cached) return cached;

  const err = (r: Rates): number => {
    const p = outcomeProbs(r);
    return (p.h - pH) ** 2 + (p.d - pD) ** 2 + (p.a - pA) ** 2;
  };

  let best: Rates = { home: 1.3, away: 1.1 };
  let bestErr = Infinity;

  for (let h = 0.15; h <= 4.0; h += 0.1) {
    for (let a = 0.15; a <= 4.0; a += 0.1) {
      const e = err({ home: h, away: a });
      if (e < bestErr) {
        bestErr = e;
        best = { home: h, away: a };
      }
    }
  }

  for (let h = best.home - 0.1; h <= best.home + 0.1; h += 0.02) {
    for (let a = best.away - 0.1; a <= best.away + 0.1; a += 0.02) {
      if (h <= 0 || a <= 0) continue;
      const e = err({ home: h, away: a });
      if (e < bestErr) {
        bestErr = e;
        best = { home: h, away: a };
      }
    }
  }

  if (fitCache.size > 500) fitCache.clear();
  fitCache.set(key, best);
  return best;
}

function price(p: number): number {
  const safe = Math.min(0.95, Math.max(0.0015, p * MARGIN));
  return Math.round((1 / safe) * 100) / 100;
}

/** Goal rates implied by a 1X2 price, with the overround stripped first. */
export function ratesFromOdds(home: number, draw: number, away: number): Rates {
  const ph = 1 / home;
  const pd = 1 / draw;
  const pa = 1 / away;
  const total = ph + pd + pa;
  return fitRates(ph / total, pd / total, pa / total);
}

/**
 * The full scoreline grid, ordered by likelihood so the shortest prices sit
 * first — which is the order a player scans them in.
 */
export function correctScoreMarket(home: number, draw: number, away: number): Market {
  const rates = ratesFromOdds(home, draw, away);

  const cells: { outcome: string; p: number }[] = [];
  let covered = 0;

  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = poisson(i, rates.home) * poisson(j, rates.away);
      covered += p;
      cells.push({ outcome: `${i}:${j}`, p });
    }
  }

  cells.sort((a, b) => b.p - a.p);

  const prices: Price[] = cells
    .filter((c) => c.p > 0.0015)
    .map((c) => ({ outcome: c.outcome, label: c.outcome, odds: price(c.p) }));

  // Everything past the grid collapses into one outcome. It is always offered,
  // however remote — without it a freak 8-2 has no winning outcome at all and
  // the market stops being exhaustive.
  const other = Math.max(0, 1 - covered);
  prices.push({ outcome: "Any Other", label: "Any other", odds: price(other) });

  return { key: "cs", label: "Correct Score", group: "specials", dense: true, prices };
}

/** Odd/even and exact-goals markets, from the same fitted model. */
export function goalCountMarkets(home: number, draw: number, away: number): Market[] {
  const rates = ratesFromOdds(home, draw, away);

  const totals: number[] = [];
  for (let t = 0; t <= 10; t++) {
    let p = 0;
    for (let i = 0; i <= t; i++) p += poisson(i, rates.home) * poisson(t - i, rates.away);
    totals[t] = p;
  }

  const odd = totals.reduce((acc, p, t) => (t % 2 === 1 ? acc + p : acc), 0);
  const even = totals.reduce((acc, p, t) => (t % 2 === 0 ? acc + p : acc), 0);

  const exact: Price[] = totals
    .slice(0, 6)
    .map((p, t) => ({ outcome: String(t), label: `${t} goal${t === 1 ? "" : "s"}`, odds: price(p) }))
    .filter((x) => Number.isFinite(x.odds));

  const sixPlus = totals.slice(6).reduce((a, b) => a + b, 0);
  if (sixPlus > 0.0015) {
    exact.push({ outcome: "6+", label: "6 or more", odds: price(sixPlus) });
  }

  return [
    {
      key: "oe",
      label: "Odd / Even",
      group: "goals",
      prices: [
        { outcome: "Odd", label: "Odd", odds: price(odd) },
        { outcome: "Even", label: "Even", odds: price(even) },
      ],
    },
    {
      key: "eg",
      label: "Exact Goals",
      group: "goals",
      dense: true,
      prices: exact,
    },
  ];
}
