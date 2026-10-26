import { db } from "./supabase";
import {
  fetchFixtures,
  fetchLiveFixtures,
  fetchOdds,
  fetchFixtureOdds,
  fetchFixtureById,
  syntheticOdds,
  isFinished,
  isLiveStatus,
  type UpstreamFixture,
} from "./api-football";
import { buildMarkets } from "./markets";
import { matchClock, scoreFromTimeline } from "./clock";
import { deriveMarkets, driftOdds, applyBoost, type Market } from "./odds";
import { correctScoreMarket, goalCountMarkets } from "./scoreline";
import { fetchEspnFixtures } from "./espn";

/**
 * The public fixture feed.
 *
 * Merges two sources — upstream API-Football fixtures and operator-created
 * custom matches — applies operator overrides on top of whichever source a
 * fixture came from, and filters finished matches out of both.
 *
 * If Supabase is unavailable the custom matches are dropped and the upstream
 * fixtures still render: the feed degrades to fewer matches, never to none.
 */

export interface FeedMatch {
  id: string;
  source: "api" | "custom";
  league: string;
  country: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  homeCrest: string | null;
  awayCrest: string | null;
  kickoff: string;
  isLive: boolean;
  isLocked: boolean;
  postponed: boolean;
  minuteLabel: string;
  scoreHome: number | null;
  scoreAway: number | null;
  bestOdds: boolean;
  markets: Market[];
}

interface CustomRow {
  id: string;
  home_team: string;
  away_team: string;
  home_crest: string | null;
  away_crest: string | null;
  league: string;
  sport: string;
  kickoff: string;
  odds_home: number;
  odds_draw: number;
  odds_away: number;
  goal_timeline: { minute: number; team: "home" | "away" }[];
  is_live: boolean;
  is_locked: boolean;
  best_odds: boolean;
  final_home: number | null;
  final_away: number | null;
  finished: boolean;
}

interface OverrideRow {
  match_id: string;
  score_home: number | null;
  score_away: number | null;
  minute: number | null;
  is_live: boolean | null;
  is_locked: boolean | null;
  postponed: boolean | null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrow(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

export async function getFeed(): Promise<FeedMatch[]> {
  const [upstream, custom, overrides] = await Promise.all([
    loadUpstream(),
    loadCustom(),
    loadOverrides(),
  ]);

  // ESPN only when API-Football gave us nothing. It is a real feed with real
  // prices, but the primary one carries more markets per fixture, so it is a
  // fallback rather than a supplement -- and showing both would put the same
  // match on the board twice under two different ids.
  const fallback = upstream.length === 0 ? await fetchEspnFixtures() : [];

  const merged = [...custom, ...upstream, ...fallback];

  const withOverrides = merged.map((m) => {
    const o = overrides.get(m.id);
    if (!o) return m;
    return {
      ...m,
      scoreHome: o.score_home ?? m.scoreHome,
      scoreAway: o.score_away ?? m.scoreAway,
      minuteLabel: o.minute != null ? `${o.minute}'` : m.minuteLabel,
      isLive: o.is_live ?? m.isLive,
      // Live betting is locked, and a postponed fixture is never bettable.
      isLocked: (o.is_locked ?? m.isLocked) || Boolean(o.postponed),
      postponed: o.postponed ?? m.postponed,
    };
  });

  // A postponed fixture still shows, so a player who bet on it can see why.
  return withOverrides.sort((a, b) => {
    if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
    return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
  });
}

async function loadUpstream(): Promise<FeedMatch[]> {
  const dates = [today(), tomorrow()];
  const [fixturesByDate, oddsByDate, liveFixtures] = await Promise.all([
    Promise.all(dates.map((d) => fetchFixtures(d))),
    Promise.all(dates.map((d) => fetchOdds(d))),
    // Fetched separately: the dated card is whitelisted, and at most hours the
    // football actually being played sits outside that list.
    fetchLiveFixtures(),
  ]);

  const out: FeedMatch[] = [];
  const seen = new Set<string>();

  // Live first, so a match appearing in both keeps its in-play state.
  const sources = [liveFixtures, ...fixturesByDate];
  const oddsFor = [new Map<string, { home: number; draw: number; away: number }>(), ...oddsByDate];

  for (let i = 0; i < sources.length; i++) {
    const odds = oddsFor[i];
    for (const f of sources[i]) {
      if (isFinished(f.statusShort)) continue;
      if (seen.has(f.id)) continue;
      seen.add(f.id);

      // Any market upstream did not price is derived locally from 1X2, so the
      // market selector always has something to show.
      const priced = odds.get(f.id) ?? oddsByDate[0].get(f.id) ?? syntheticOdds(f.id);

      out.push(toFeedMatch(f, priced));
    }
  }

  return out;
}

/** One upstream fixture as a board entry. Shared so a fixture fetched on its
 *  own is built exactly like one that came off the board. */
function toFeedMatch(
  f: UpstreamFixture,
  priced: { home: number; draw: number; away: number },
): FeedMatch {
  const live = isLiveStatus(f.statusShort);

  return {
    id: f.id,
    source: "api",
    league: f.league,
    country: f.country,
    sport: "football",
    homeTeam: f.homeTeam,
    awayTeam: f.awayTeam,
    homeCrest: f.homeCrest,
    awayCrest: f.awayCrest,
    kickoff: f.kickoff,
    isLive: live,
    isLocked: live, // Live betting is locked platform-wide.
    postponed: f.statusShort === "PST",
    // Only live state is labelled server-side. A kickoff time is left for
    // the browser to format, so it shows in the player's own timezone
    // rather than the host's.
    minuteLabel: live ? (f.minute != null ? `${f.minute}'` : "LIVE") : "",
    scoreHome: f.scoreHome,
    scoreAway: f.scoreAway,
    bestOdds: false,
    markets: deriveMarkets(priced.home, priced.draw, priced.away),
  };
}

async function loadCustom(): Promise<FeedMatch[]> {
  const supabase = db();
  if (!supabase) return []; // Degrade to upstream only.

  const { data, error } = await supabase
    .from("custom_matches")
    .select("*")
    .eq("finished", false)
    .order("kickoff", { ascending: true })
    .limit(120);

  if (error || !data) return [];

  const out: FeedMatch[] = [];

  for (const row of data as CustomRow[]) {
    const clock = matchClock(row.kickoff, row.sport ?? "football");
    if (clock.isOver) continue; // Finished matches drop out of the feed.

    const timeline = row.goal_timeline ?? [];
    const score = clock.isLive ? scoreFromTimeline(timeline, clock) : { home: 0, away: 0 };

    const base = {
      home: Number(row.odds_home),
      draw: Number(row.odds_draw),
      away: Number(row.odds_away),
    };

    // Odds move with the scoreline once the match is running. This is
    // presentational only — live betting is locked, so no ticket is ever
    // struck at a drifted price.
    const live = clock.isLive || row.is_live;
    const shown = live ? driftOdds(base, score, clock.minute) : base;

    const boosted = {
      home: applyBoost(shown.home, row.best_odds),
      draw: applyBoost(shown.draw, row.best_odds),
      away: applyBoost(shown.away, row.best_odds),
    };

    out.push({
      id: `cm_${row.id}`,
      source: "custom",
      league: row.league,
      country: "3btafric",
      sport: row.sport ?? "football",
      homeTeam: row.home_team,
      awayTeam: row.away_team,
      homeCrest: row.home_crest,
      awayCrest: row.away_crest,
      kickoff: row.kickoff,
      isLive: live,
      isLocked: live || row.is_locked,
      postponed: false,
      minuteLabel: clock.label,
      scoreHome: live ? score.home : null,
      scoreAway: live ? score.away : null,
      bestOdds: row.best_odds,
      // Operator matches carry the scoreline markets too, fitted to the same
      // 1X2 price so every market on the card agrees with the others.
      markets: [
        ...deriveMarkets(boosted.home, boosted.draw, boosted.away),
        ...goalCountMarkets(boosted.home, boosted.draw, boosted.away),
        correctScoreMarket(boosted.home, boosted.draw, boosted.away),
      ],
    });
  }

  return out;
}

async function loadOverrides(): Promise<Map<string, OverrideRow>> {
  const supabase = db();
  const out = new Map<string, OverrideRow>();
  if (!supabase) return out;

  const { data } = await supabase.from("match_overrides").select("*");
  for (const o of (data ?? []) as OverrideRow[]) out.set(o.match_id, o);
  return out;
}


/**
 * One match with its full market set.
 *
 * The board carries only the derived markets, because pricing eighty markets
 * for every fixture on the card would be far too many upstream requests. A
 * details view pulls the real set for that one fixture.
 *
 * Both the details page and bet placement go through here, so a player can
 * never be shown a price the placement endpoint would refuse to honour.
 */
/**
 * A fixture that is not on the board, asked for by id.
 *
 * The board is two windows — today and tomorrow in the whitelisted leagues,
 * plus whatever is live anywhere — and a match can fall out of both while a
 * slip built on it is still open. Without this, such a slip could never be
 * placed again, however long the match was still from kicking off.
 *
 * Only upstream fixtures need it: a custom match is on the board until the
 * operator finishes it, and an id that is neither is genuinely unknown.
 */
async function offBoardMatch(id: string): Promise<FeedMatch | null> {
  // Upstream ids are numeric; a custom match is `cm_<uuid>`. Asking upstream
  // about anything else only spends quota to be told nothing.
  if (!/^\d+$/.test(id)) return null;

  const fixture = await fetchFixtureById(id);
  if (!fixture) return null;
  return toFeedMatch(fixture, syntheticOdds(fixture.id));
}

export async function getMatchDetail(id: string): Promise<FeedMatch | null> {
  const feed = await getFeed();
  const match = feed.find((m) => m.id === id) ?? (await offBoardMatch(id));
  if (!match) return null;

  // Operator-created matches are priced by the operator; there is no upstream
  // book for them, so the derived set is the whole truth.
  if (match.source === "custom") return match;

  const bookmakers = await fetchFixtureOdds(id);
  const full = buildMarkets(bookmakers);

  // Upstream prices nothing for plenty of smaller fixtures. Fall back to the
  // derived markets rather than showing an empty board.
  if (full.length < 2) return match;

  // Keep the derived 1X2 if upstream did not price one, so the board and the
  // details page never disagree about the headline market.
  const hasMatchWinner = full.some((m) => m.key === "af1");
  const markets = hasMatchWinner ? full : [...match.markets.filter((m) => m.key === "1x2"), ...full];

  return { ...match, markets };
}
