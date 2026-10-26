import type { Market, Price } from "./odds";

/**
 * Matching a slip selection back to a live market.
 *
 * The platform has two vocabularies for the same bet. The board derives its
 * markets locally and calls the match result `1x2` with outcomes `1 / X / 2`;
 * the details page serves the real book, which calls it `af1` with outcomes
 * `Home / Draw / Away`. A player who taps odds on the board and then submits
 * would otherwise be told their selection is "no longer offered", because the
 * exact key does not exist on the other side.
 *
 * So a selection is matched on what it *means* rather than on how it was
 * spelled: both sides reduce to a canonical family and pick, and a leg placed
 * from either surface resolves against whichever markets are live at submit.
 */

type Family = "1x2" | "dc" | "dnb" | "ou" | "btts" | "cs" | "oe" | "eg";

interface Canonical {
  family: Family;
  pick: string;
}

/** Market keys that mean the same thing on each side. */
const FAMILY_BY_KEY: Record<string, Family> = {
  "1x2": "1x2",
  af1: "1x2",
  dc: "dc",
  af12: "dc",
  dnb: "dnb",
  af2: "dnb",
  ou25: "ou",
  ou15: "ou",
  af5: "ou",
  af50: "ou",
  btts: "btts",
  af8: "btts",
  cs: "cs",
  af10: "cs",
  oe: "oe",
  af21: "oe",
  eg: "eg",
  af38: "eg",
};

function side(value: string): string | null {
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

/** "Over 2.5", "O2.5", "u/1.5" all reduce to over:2.5 / under:1.5. */
function overUnder(value: string): string | null {
  const v = value.trim().toLowerCase();
  const num = v.match(/-?\d+(?:\.\d+)?/);
  if (!num) return null;

  const isOver = /^o\b|^o\d|over/.test(v);
  const isUnder = /^u\b|^u\d|under/.test(v);
  if (!isOver && !isUnder) return null;

  return `${isOver ? "over" : "under"}:${Number(num[0])}`;
}

function doubleChance(value: string): string | null {
  const v = value.trim().toLowerCase().replace(/[\s]/g, "");
  if (v === "1x" || v === "home/draw") return "hd";
  if (v === "12" || v === "home/away") return "ha";
  if (v === "x2" || v === "draw/away") return "da";
  return null;
}

function yesNo(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (v === "yes" || v === "gg") return "yes";
  if (v === "no" || v === "ng") return "no";
  return null;
}

function scoreline(value: string): string | null {
  const m = value.trim().match(/^(\d+)\s*[:\-–]\s*(\d+)$/);
  if (m) return `${Number(m[1])}:${Number(m[2])}`;
  if (value.trim().toLowerCase() === "any other") return "other";
  return null;
}

/** Reduce a (market, outcome) pair to what it actually means, or null. */
export function canonical(marketKey: string, outcome: string): Canonical | null {
  const family = FAMILY_BY_KEY[marketKey];
  if (!family) return null;

  let pick: string | null = null;

  switch (family) {
    case "1x2":
      pick = side(outcome);
      break;
    case "dnb": {
      const s = side(outcome);
      // Draw no bet is spelled DNB1 / DNB2 on the board.
      pick = s ?? (/(^|\D)1$/.test(outcome) ? "home" : /(^|\D)2$/.test(outcome) ? "away" : null);
      break;
    }
    case "dc":
      pick = doubleChance(outcome);
      break;
    case "ou":
      pick = overUnder(outcome);
      break;
    case "btts":
      pick = yesNo(outcome);
      break;
    case "cs":
      pick = scoreline(outcome);
      break;
    case "oe": {
      const v = outcome.trim().toLowerCase();
      pick = v === "odd" || v === "even" ? v : null;
      break;
    }
    case "eg": {
      const v = outcome.trim();
      pick = /^\d+\+?$/.test(v) ? v : null;
      break;
    }
  }

  return pick ? { family, pick } : null;
}

export interface Resolved {
  market: Market;
  price: Price;
}

/**
 * Find the live market and price a slip selection refers to.
 *
 * Tries the exact key and outcome first, so nothing changes for a selection
 * made and placed on the same surface. Only when that misses does it fall back
 * to meaning, which is what carries a board pick across to the real book.
 */
export function resolveSelection(
  markets: Market[],
  marketKey: string,
  outcome: string,
): Resolved | null {
  const exact = markets.find((m) => m.key === marketKey);
  const exactPrice = exact?.prices.find((p) => p.outcome === outcome);
  if (exact && exactPrice) return { market: exact, price: exactPrice };

  const want = canonical(marketKey, outcome);
  if (!want) return null;

  for (const market of markets) {
    if (FAMILY_BY_KEY[market.key] !== want.family) continue;
    for (const price of market.prices) {
      const got = canonical(market.key, price.outcome);
      if (got && got.pick === want.pick) return { market, price };
    }
  }

  return null;
}
