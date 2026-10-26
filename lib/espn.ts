import { deriveMarkets } from "./odds";
import type { FeedMatch } from "./fixtures";

/**
 * Fallback football feed: ESPN's public scoreboard. No key, no quota.
 *
 * Used only when API-Football gives us nothing — most often the free tier's
 * daily request limit — so the board shows real matches instead of going
 * blank until the quota resets. These are real fixtures carrying real
 * bookmaker prices, not invented ones: a match without a full 1X2 book is
 * dropped rather than priced by us.
 *
 * Ids are prefixed so they can never be mistaken for an API-Football fixture
 * id. A bare numeric ESPN id would collide with a different real fixture, and
 * settlement reads scores by id — a collision would settle a ticket against
 * the wrong match.
 */

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard";

export const ESPN_ID_PREFIX = "espn-";

/** Whether an id came from this feed rather than API-Football. */
export function isEspnId(id: string): boolean {
  return id.startsWith(ESPN_ID_PREFIX);
}

const TTL_MS = 60_000;
let cache: { at: number; value: FeedMatch[] } | null = null;

interface Side {
  open?: { odds?: string; line?: string };
  close?: { odds?: string; line?: string };
}

interface Competition {
  status?: { displayClock?: string; type?: { name?: string; state?: string } };
  venue?: { address?: { country?: string } };
  altGameNote?: string;
  competitors?: {
    homeAway?: "home" | "away";
    score?: string;
    team?: { displayName?: string; logo?: string };
  }[];
  odds?: { moneyline?: { home?: Side; away?: Side }; drawOdds?: { moneyLine?: number } }[];
}

interface Event {
  id: string;
  date: string;
  competitions?: Competition[];
}

/** American odds ("-245", "+650", "EVEN") to decimal. 0 when unusable. */
function americanToDecimal(value: string | number | undefined | null): number {
  if (value == null) return 0;
  if (typeof value === "string" && value.trim().toUpperCase() === "EVEN") return 2;
  const n = typeof value === "number" ? value : parseFloat(value);
  if (!Number.isFinite(n) || n === 0) return 0;
  return Number((n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n)).toFixed(2));
}

/** The closing price where the book has one, the opening price otherwise. */
function sidePrice(side: Side | undefined): number {
  return americanToDecimal(side?.close?.odds ?? side?.open?.odds);
}

function toFeedMatch(ev: Event): FeedMatch | null {
  const comp = ev.competitions?.[0];
  if (!comp) return null;

  const home = comp.competitors?.find((c) => c.homeAway === "home");
  const away = comp.competitors?.find((c) => c.homeAway === "away");
  if (!home?.team?.displayName || !away?.team?.displayName) return null;

  const book = comp.odds?.[0];
  const oddsHome = sidePrice(book?.moneyline?.home);
  const oddsAway = sidePrice(book?.moneyline?.away);
  const oddsDraw = americanToDecimal(book?.drawOdds?.moneyLine);
  // No book, no match. A price we made up is worse than one fewer fixture.
  if (oddsHome <= 0 || oddsDraw <= 0 || oddsAway <= 0) return null;

  const type = comp.status?.type?.name ?? "";
  if (type === "STATUS_POSTPONED" || type === "STATUS_CANCELED") return null;

  const state = comp.status?.type?.state;
  const isLive = state === "in";
  // A finished match is not bettable and does not belong on the board.
  if (state === "post") return null;

  const scoreHome = Number(home.score);
  const scoreAway = Number(away.score);

  return {
    id: `${ESPN_ID_PREFIX}${ev.id}`,
    source: "api",
    league: comp.altGameNote || "Football",
    country: comp.venue?.address?.country ?? "World",
    sport: "football",
    homeTeam: home.team.displayName,
    awayTeam: away.team.displayName,
    homeCrest: home.team.logo ?? null,
    awayCrest: away.team.logo ?? null,
    kickoff: new Date(ev.date).toISOString(),
    isLive,
    isLocked: isLive, // Live betting is locked platform-wide.
    postponed: false,
    minuteLabel: isLive
      ? type === "STATUS_HALFTIME"
        ? "HT"
        : (comp.status?.displayClock ?? "").trim() || "LIVE"
      : "",
    scoreHome: isLive && Number.isFinite(scoreHome) ? scoreHome : null,
    scoreAway: isLive && Number.isFinite(scoreAway) ? scoreAway : null,
    bestOdds: false,
    markets: deriveMarkets(oddsHome, oddsDraw, oddsAway),
  };
}

/**
 * Today's and tomorrow's football from ESPN, priced and ready for the board.
 *
 * Degrades to an empty list rather than throwing: this is already the path
 * taken when the primary feed has failed, and a fallback that throws would
 * take the whole board down with it.
 */
export async function fetchEspnFixtures(): Promise<FeedMatch[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  const days = [0, 1].map((offset) => {
    const d = new Date(Date.now() + offset * 86_400_000);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  });

  const out: FeedMatch[] = [];
  const seen = new Set<string>();

  for (const ymd of days) {
    try {
      const res = await fetch(`${SCOREBOARD}?dates=${ymd}&limit=300`, {
        next: { revalidate: 60 },
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { events?: Event[] };
      for (const ev of json.events ?? []) {
        if (seen.has(ev.id)) continue;
        const match = toFeedMatch(ev);
        if (!match) continue;
        seen.add(ev.id);
        out.push(match);
      }
    } catch (err) {
      console.error("[espn] scoreboard", ymd, err);
    }
  }

  if (out.length) {
    console.info("[espn] serving fallback fixtures", out.length);
    cache = { at: Date.now(), value: out };
  }
  return out;
}
