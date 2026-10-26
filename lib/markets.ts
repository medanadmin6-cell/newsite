import type { Market, MarketGroup, Price } from "./odds";

/**
 * Turning an upstream odds payload into the market board.
 *
 * API-Football returns up to ~85 distinct markets per fixture, spread across a
 * dozen bookmakers who each price a different subset. Two rules govern how they
 * are assembled:
 *
 *  1. One bookmaker per market. Taking the best price for each outcome from a
 *     different book would leave the market with no overround — an arbitrage
 *     against ourselves. Whichever book prices a market most completely wins it,
 *     and we inherit that book's margin intact.
 *
 *  2. Everything is grouped for the filter row, so a player can get to corners
 *     or half-time markets without scrolling past eighty cards.
 */

export interface RawBet {
  id: number;
  name: string;
  values: { value: string; odd: string }[];
}

export interface RawBookmaker {
  id: number;
  name: string;
  bets: RawBet[];
}

/** Markets we deliberately do not show. */
const EXCLUDED = new Set([
  78, // RTG_H1 — an unlabelled internal market with no readable outcomes
]);

/**
 * Correct-score style markets carry dozens of outcomes. They are kept, but
 * flagged so the card can lay them out as a dense grid rather than three
 * full-width buttons.
 */
export const SCORELINE_MARKETS = new Set([10, 31, 62]);

const MAX_VALUES = 24;
const MAX_SCORELINE_VALUES = 60;

function classify(name: string): MarketGroup {
  const n = name.toLowerCase();

  // Order matters: corners and halves win over the generic goal wording they
  // also contain ("Corners Over Under", "Goals Over/Under First Half").
  if (n.includes("corner")) return "corners";
  if (/(exact score|correct score)/.test(n)) return "specials";
  if (/(first half|second half|1st half|2nd half|both halves|ht\/ft|halftime|half time|scoring half|either half)/.test(n))
    return "half";
  if (n.includes("handicap") || n.includes("goal line")) return "handicap";
  if (/(clean sheet|win to nil|total - home|total - away|team to score|team score|will score|home team|away team|score a goal)/.test(n))
    return "teams";
  if (/(over\/under|over under|both teams|total goals|exact goals|odd\/even|number of goals|goals)/.test(n))
    return "goals";
  if (/(match winner|double chance|home\/away|draw no bet|result)/.test(n)) return "main";

  return "specials";
}

/** Tidy the upstream naming so the card headers read consistently. */
function label(name: string): string {
  return name
    .replace(/^Goals Over\/Under$/i, "Over / Under")
    .replace(/Over\/Under/gi, "Over / Under")
    .replace(/Over Under/gi, "Over / Under")
    .replace(/^Match Winner$/i, "1X2")
    .replace(/^Both Teams Score$/i, "GG / NG")
    .replace(/\s+/g, " ")
    .trim();
}

/** Outcome labels are shown verbatim; only the obvious shorthand is expanded. */
function outcomeLabel(value: string): string {
  const map: Record<string, string> = {
    Home: "Home",
    Away: "Away",
    Draw: "Draw",
    Yes: "Yes",
    No: "No",
  };
  return map[value] ?? value;
}

/**
 * Pick one bookmaker per market — the one pricing it most completely — then
 * build the market list from those choices.
 */
export function buildMarkets(bookmakers: RawBookmaker[]): Market[] {
  const chosen = new Map<number, { bet: RawBet; book: string }>();

  for (const book of bookmakers ?? []) {
    for (const bet of book.bets ?? []) {
      if (EXCLUDED.has(bet.id)) continue;
      if (!bet.values?.length) continue;

      const existing = chosen.get(bet.id);
      if (!existing || bet.values.length > existing.bet.values.length) {
        chosen.set(bet.id, { bet, book: book.name });
      }
    }
  }

  const markets: Market[] = [];

  for (const [id, { bet }] of chosen) {
    const prices: Price[] = [];

    const cap = SCORELINE_MARKETS.has(id) ? MAX_SCORELINE_VALUES : MAX_VALUES;

    for (const v of bet.values.slice(0, cap)) {
      const odds = Number(v.odd);
      if (!Number.isFinite(odds) || odds <= 1) continue;
      prices.push({
        outcome: v.value,
        label: outcomeLabel(v.value),
        odds: Math.round(odds * 100) / 100,
      });
    }

    if (prices.length < 2) continue;

    markets.push({
      key: `af${id}`,
      label: label(bet.name),
      group: classify(bet.name),
      dense: SCORELINE_MARKETS.has(id),
      prices,
    });
  }

  return markets.sort(byPriority);
}

/** 1X2 first, then the rest of the main markets, then everything else. */
const GROUP_ORDER: MarketGroup[] = ["main", "goals", "handicap", "half", "teams", "corners", "specials"];

function byPriority(a: Market, b: Market): number {
  if (a.key === "af1") return -1;
  if (b.key === "af1") return 1;

  const ga = GROUP_ORDER.indexOf(a.group);
  const gb = GROUP_ORDER.indexOf(b.group);
  if (ga !== gb) return ga - gb;

  // Fewer outcomes first — the simple markets are the ones people bet.
  return a.prices.length - b.prices.length;
}

/** The filter row on the details page, in the order it is shown. */
export const MARKET_FILTERS: { key: MarketGroup | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "main", label: "Main" },
  { key: "goals", label: "Goals" },
  { key: "half", label: "Half" },
  { key: "handicap", label: "Handicap" },
  { key: "corners", label: "Corners" },
  { key: "teams", label: "Teams" },
  { key: "specials", label: "Specials" },
];


/**
 * A readable name for a stored market key.
 *
 * A leg records the key it was struck on, not the label, so a settled ticket
 * would otherwise show "AF1" where it means the match result. The live market
 * carries the proper label, but a ticket outlives the market it was placed on,
 * so the common keys are named here too.
 */
const KEY_LABELS: Record<string, string> = {
  "1x2": "1X2",
  af1: "1X2",
  dc: "Double Chance",
  af12: "Double Chance",
  dnb: "Draw No Bet",
  af2: "Draw No Bet",
  ou25: "Over / Under 2.5",
  ou15: "Over / Under 1.5",
  af5: "Over / Under",
  af50: "Goal Line",
  btts: "GG / NG",
  af8: "GG / NG",
  cs: "Correct Score",
  af10: "Correct Score",
  oe: "Odd / Even",
  af21: "Odd / Even",
  eg: "Exact Goals",
  af38: "Exact Goals",
  af9: "Handicap",
  af4: "Asian Handicap",
  af13: "1st Half 1X2",
  af6: "1st Half Over / Under",
  af3: "2nd Half 1X2",
  af7: "HT / FT",
  af45: "Corners Over / Under",
};

export function marketName(key: string): string {
  return KEY_LABELS[key.toLowerCase()] ?? key.toUpperCase();
}
