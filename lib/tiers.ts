/**
 * Loyalty tiers.
 *
 * Tier points are earned on turnover, not on deposits: one point per unit
 * staked. Rewarding deposits would pay a player for funding an account they
 * never play, and would pull against the withdrawal gate, which exists to stop
 * exactly that pattern.
 *
 * The numbers here are real — they come from the sum of a player's stakes — so
 * the meter on the account screen is not decoration.
 */

export interface Tier {
  name: string;
  at: number;
  /** Share of stake returned as the loyalty reward at this tier. */
  rewardRate: number;
}

export const TIERS: Tier[] = [
  { name: "Rookie", at: 0, rewardRate: 0 },
  { name: "Golden Boy", at: 100, rewardRate: 0.002 },
  { name: "Captain", at: 2_000, rewardRate: 0.004 },
  { name: "Maestro", at: 10_000, rewardRate: 0.006 },
  { name: "Legend", at: 50_000, rewardRate: 0.01 },
];

export interface TierStanding {
  current: Tier;
  next: Tier | null;
  points: number;
  /** Points still needed for the next tier, 0 at the top. */
  toNext: number;
  /** Progress through the current tier, 0-1. */
  progress: number;
  /** What the player has earned back at their rate so far. */
  potentialReward: number;
}

export function standing(points: number): TierStanding {
  const p = Math.max(0, Math.floor(points));

  let current = TIERS[0];
  for (const t of TIERS) {
    if (p >= t.at) current = t;
  }

  const next = TIERS.find((t) => t.at > current.at) ?? null;
  const toNext = next ? next.at - p : 0;

  // Progress runs from the floor of the current tier to the next threshold.
  const span = next ? next.at - current.at : 1;
  const progress = next ? Math.min(1, Math.max(0, (p - current.at) / span)) : 1;

  return {
    current,
    next,
    points: p,
    toNext,
    progress,
    potentialReward: Math.round(p * current.rewardRate * 100) / 100,
  };
}

/** Mask a phone the way the account header shows it: 50******6. */
export function maskPhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 4) return phone;
  const head = digits.slice(-9, -7) || digits.slice(0, 2);
  const tail = digits.slice(-1);
  return `${head}${"*".repeat(6)}${tail}`;
}
