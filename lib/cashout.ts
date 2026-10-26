/**
 * Cashing out an open ticket.
 *
 * The offer is the ticket's current fair value, less the book's margin:
 *
 *   value = the ticket's full payout
 *         x the current probability that every remaining leg lands
 *         x (1 - margin)
 *
 * The probability of a pending leg is read off its live price, with the
 * overround stripped out. A shortening price makes the offer rise; a drifting
 * one makes it fall, which is the whole point of the feature.
 *
 * Refusing is the default. A ticket with a lost leg, an unpriced leg, or a leg
 * already in play is not offered a number at all, because any figure we
 * produced there would be a guess with real money behind it.
 */

export const CASHOUT_MARGIN = 0.08;

/** Below this the offer is not worth showing. */
export const MIN_CASHOUT = 0.5;

export type LegState = "won" | "lost" | "pending";

export interface CashoutLeg {
  state: LegState;
  /** The price struck when the bet was placed. */
  odds: number;
  /** The live price now, or null when the market can no longer be priced. */
  currentOdds: number | null;
  /** True once the match is running: in-play legs are not cashed out here. */
  live: boolean;
}

export type CashoutRefusal =
  | "leg-lost"
  | "no-live-price"
  | "in-play"
  | "already-decided"
  | "too-small";

export interface CashoutOffer {
  available: boolean;
  amount: number;
  /** What the ticket would return if left to run. */
  potential: number;
  reason?: CashoutRefusal;
}

export function cashoutOffer(
  stake: number,
  potentialWin: number,
  legs: CashoutLeg[],
): CashoutOffer {
  const refuse = (reason: CashoutRefusal): CashoutOffer => ({
    available: false,
    amount: 0,
    potential: potentialWin,
    reason,
  });

  if (!legs.length) return refuse("already-decided");

  // A dead ticket has no value to take.
  if (legs.some((l) => l.state === "lost")) return refuse("leg-lost");

  const pending = legs.filter((l) => l.state === "pending");

  // Every leg already won: this is a winner waiting to be paid, not a cashout.
  if (!pending.length) return refuse("already-decided");

  // A running match is priced by the moment, and this platform locks in-play
  // betting — so it cannot honestly value one either.
  if (pending.some((l) => l.live)) return refuse("in-play");

  if (pending.some((l) => l.currentOdds === null || !(l.currentOdds > 1))) {
    return refuse("no-live-price");
  }

  // Probability the rest of the ticket lands, at today's prices. Legs already
  // won are certain and contribute nothing here.
  const survival = pending.reduce((acc, l) => acc * (1 / (l.currentOdds as number)), 1);

  // Fair value is the full payout weighted by the chance of getting it. The
  // odds of legs already won are baked into potentialWin, so multiplying by
  // them again would value the ticket at a fraction of what it is worth.
  const fair = potentialWin * survival;
  const amount = Math.round(fair * (1 - CASHOUT_MARGIN) * 100) / 100;

  if (amount < MIN_CASHOUT) return refuse("too-small");

  return {
    available: true,
    // Never offer more than the ticket could ever pay.
    amount: Math.min(amount, Math.round(potentialWin * 100) / 100),
    potential: potentialWin,
  };
}

export function refusalMessage(reason: CashoutRefusal | undefined): string {
  switch (reason) {
    case "leg-lost":
      return "This ticket has a losing leg, so there is nothing to cash out.";
    case "in-play":
      return "Cashout is closed while a match on this ticket is being played.";
    case "no-live-price":
      return "One of these markets is no longer priced, so we cannot value the ticket.";
    case "already-decided":
      return "This ticket is already decided.";
    case "too-small":
      return "The cashout value is too small to offer.";
    default:
      return "Cashout is not available on this ticket.";
  }
}
