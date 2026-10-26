/**
 * The accumulator bonus.
 *
 * A multiple pays a percentage on top of the return, rising with the number of
 * legs. Only legs priced at or above the qualifying odds count toward it, which
 * is what stops a player padding a ticket with 1.01 shots to buy the bonus
 * without taking any real risk.
 *
 * The rate is applied to the winnings, not to the stake returned — a losing
 * ticket obviously pays nothing.
 */

/** A leg must be at least this price to count toward the bonus. */
export const QUALIFYING_ODDS = 1.2;

/** Legs needed before any bonus applies. */
export const MIN_LEGS = 3;

/** Bonus rate by qualifying-leg count. The last entry is the ceiling. */
const SCHEDULE: { legs: number; rate: number }[] = [
  { legs: 3, rate: 0.03 },
  { legs: 4, rate: 0.05 },
  { legs: 5, rate: 0.1 },
  { legs: 6, rate: 0.15 },
  { legs: 7, rate: 0.2 },
  { legs: 8, rate: 0.25 },
  { legs: 9, rate: 0.3 },
  { legs: 10, rate: 0.4 },
  { legs: 12, rate: 0.5 },
  { legs: 15, rate: 0.6 },
];

export interface BonusStanding {
  /** How many legs on the ticket qualify. */
  qualifying: number;
  rate: number;
  /** Legs still needed for the next step up, or 0 at the ceiling. */
  toNext: number;
  nextRate: number;
}

export function bonusFor(oddsPerLeg: number[]): BonusStanding {
  const qualifying = oddsPerLeg.filter((o) => o >= QUALIFYING_ODDS).length;

  let rate = 0;
  for (const step of SCHEDULE) {
    if (qualifying >= step.legs) rate = step.rate;
  }

  const next = SCHEDULE.find((s) => s.legs > qualifying);

  return {
    qualifying,
    rate,
    toNext: next ? next.legs - qualifying : 0,
    nextRate: next?.rate ?? rate,
  };
}

/**
 * Bonus amount on a winning multiple: a share of the profit, never of the
 * stake the player is simply getting back.
 */
export function bonusAmount(stake: number, totalOdds: number, oddsPerLeg: number[]): number {
  const { rate } = bonusFor(oddsPerLeg);
  if (rate <= 0) return 0;
  const profit = stake * totalOdds - stake;
  if (profit <= 0) return 0;
  return Math.round(profit * rate * 100) / 100;
}

/** The full return on a winning multiple, bonus included. */
export function potentialWin(stake: number, totalOdds: number, oddsPerLeg: number[]): number {
  const base = stake * totalOdds;
  return Math.round((base + bonusAmount(stake, totalOdds, oddsPerLeg)) * 100) / 100;
}

// --------------------------------------------------------------- system bets

/**
 * A system ticket is every combination of a given size. A 2/4 is the six
 * doubles you can make from four selections; each combination is its own line
 * with its own stake, so any two landing pays.
 */
export function combinations<T>(items: T[], size: number): T[][] {
  if (size <= 0 || size > items.length) return [];
  if (size === items.length) return [items.slice()];

  const out: T[][] = [];
  const build = (start: number, current: T[]) => {
    if (current.length === size) {
      out.push(current.slice());
      return;
    }
    for (let i = start; i < items.length; i++) {
      current.push(items[i]);
      build(i + 1, current);
      current.pop();
    }
  };
  build(0, []);
  return out;
}

export function combinationCount(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return Math.round(result);
}

/** The system sizes offered for a slip of n legs: 2/n up to (n-1)/n. */
export function systemSizes(n: number): number[] {
  if (n < 3) return [];
  const sizes: number[] = [];
  for (let k = 2; k < n; k++) sizes.push(k);
  return sizes;
}
