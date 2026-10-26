/**
 * API-Football v3. Upstream fixtures, restricted to a competition whitelist and
 * cached in-process for 60 seconds.
 *
 * Every function here degrades to an empty list rather than throwing: if the
 * key is missing or the upstream is down, the feed falls back to custom
 * matches instead of failing the page.
 */

const BASE = "https://v3.football.api-sports.io";
const TTL_MS = 60_000;

/** Scores move; the live card is refreshed harder than the dated one. */
const LIVE_TTL_MS = 20_000;

/** Roughly forty competitions worth pricing for this market. */
export const LEAGUE_WHITELIST = [
  39, 40, 41, 42, // England: Premier League, Championship, League One, League Two
  140, 141, // Spain: La Liga, Segunda
  135, 136, // Italy: Serie A, Serie B
  78, 79, // Germany: Bundesliga, 2. Bundesliga
  61, 62, // France: Ligue 1, Ligue 2
  88, 89, // Netherlands: Eredivisie, Eerste Divisie
  94, 95, // Portugal: Primeira Liga, Liga 2
  144, // Belgium: Jupiler
  203, // Turkey: Super Lig
  218, // Austria: Bundesliga
  207, // Switzerland: Super League
  106, 107, // Poland
  113, // Sweden: Allsvenskan
  103, // Norway: Eliteserien
  119, // Denmark: Superliga
  197, // Greece: Super League
  235, 236, // Russia
  2, 3, 848, // UEFA: Champions League, Europa League, Conference League
  1, 4, 5, // World Cup, Euro, Nations League
  253, // USA: MLS
  262, // Mexico: Liga MX
  71, 72, // Brazil: Serie A, Serie B
  128, // Argentina: Liga Profesional
  233, // Egypt: Premier League
  288, // South Africa: PSL
  200, // Morocco: Botola
  332, // Ghana: Premier League
  399, // Nigeria: NPFL
  276, // Kenya: Premier League
] as const;

export interface UpstreamFixture {
  id: string;
  source: "api";
  league: string;
  leagueId: number;
  country: string;
  sport: "football";
  homeTeam: string;
  awayTeam: string;
  homeCrest: string | null;
  awayCrest: string | null;
  kickoff: string;
  statusShort: string;
  minute: number | null;
  scoreHome: number | null;
  scoreAway: number | null;
  odds: { home: number; draw: number; away: number } | null;
}

type CacheEntry = { at: number; value: UpstreamFixture[] };
const cache = new Map<string, CacheEntry>();

function key(): string | null {
  return process.env.API_FOOTBALL_KEY || null;
}

/**
 * When upstream last failed us, as opposed to genuinely having no fixtures.
 *
 * Both look identical downstream — an empty list — but they mean opposite
 * things to a player holding a slip. A fixture missing because upstream is
 * unreachable is still a real fixture; only a fixture missing from a healthy
 * read has actually gone. Callers about to tell a player their match no longer
 * exists check this first, so a blip is never reported as a vanished match.
 *
 * Deliberately coarse: per instance, and only ever used to choose the wording
 * of an error, never to decide whether money moves.
 */
let unavailableSince = 0;
const UNAVAILABLE_MS = 90_000;

export function upstreamUnavailable(): boolean {
  return unavailableSince > 0 && Date.now() - unavailableSince < UNAVAILABLE_MS;
}

async function call<T>(path: string): Promise<T | null> {
  const k = key();
  // No key configured is not a blip, but it has the same consequence: nothing
  // upstream can be confirmed, so no fixture here can be called gone.
  if (!k) {
    unavailableSince = Date.now();
    return null;
  }
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "x-apisports-key": k },
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      console.error("[api-football]", path, res.status);
      unavailableSince = Date.now();
      return null;
    }
    const json = (await res.json()) as { response?: T; errors?: unknown };
    // A blown daily quota or a rejected key comes back as 200 with an errors
    // object and an empty response, which is indistinguishable from a quiet
    // day unless it is caught here.
    if (json.errors && Array.isArray(json.errors) === false && Object.keys(json.errors).length) {
      console.error("[api-football] errors", json.errors);
      unavailableSince = Date.now();
      return null;
    }
    return (json.response ?? null) as T | null;
  } catch (err) {
    console.error("[api-football] threw", path, err);
    unavailableSince = Date.now();
    return null;
  }
}

/** Statuses that mean the match is done and should drop out of the feed. */
const FINISHED = new Set(["FT", "AET", "PEN", "CANC", "ABD", "AWD", "WO"]);
const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT"]);

export function isFinished(status: string): boolean {
  return FINISHED.has(status);
}

export function isLiveStatus(status: string): boolean {
  return LIVE.has(status);
}

function toFixture(f: RawFixture): UpstreamFixture {
  return {
    id: String(f.fixture.id),
    source: "api" as const,
    league: f.league.name,
    leagueId: f.league.id,
    country: f.league.country,
    sport: "football" as const,
    homeTeam: f.teams.home.name,
    awayTeam: f.teams.away.name,
    homeCrest: f.teams.home.logo ?? null,
    awayCrest: f.teams.away.logo ?? null,
    kickoff: f.fixture.date,
    statusShort: f.fixture.status.short,
    minute: f.fixture.status.elapsed,
    scoreHome: f.goals.home,
    scoreAway: f.goals.away,
    odds: null,
  };
}

interface RawFixture {
  fixture: { id: number; date: string; status: { short: string; elapsed: number | null } };
  league: { id: number; name: string; country: string };
  teams: { home: { name: string; logo: string }; away: { name: string; logo: string } };
  goals: { home: number | null; away: number | null };
}

/**
 * Everything in play right now, from any competition.
 *
 * The dated fetch is filtered to a whitelist of about forty competitions, which
 * is right for the pre-match board but wrong for the live one: at most hours of
 * the day the only football actually being played is outside that list, so the
 * live section sat empty. In-play betting is locked platform-wide, so these are
 * shown to follow rather than to bet, and no whitelist is applied.
 *
 * Youth and reserve competitions are dropped — they carry no odds and are not
 * what a player opening the live tab is looking for.
 */
/**
 * Competitions kept off the live card: youth, reserve and academy football.
 * They carry no odds and are not what someone opening the live tab wants.
 *
 * Exported so it can be tested directly — the filter it feeds decides what a
 * player sees, and a silently broken pattern is invisible until someone looks.
 */
export function isMinorCompetition(leagueName: string): boolean {
  const n = (leagueName || "").toLowerCase();
  return (
    n.includes("youth") ||
    n.includes("reserve") ||
    n.includes("academy") ||
    n.includes("primavera") ||
    /\bu(1[5-9]|2[0-3])\b/.test(n)
  );
}

export async function fetchLiveFixtures(): Promise<UpstreamFixture[]> {
  const cached = cache.get("live");
  if (cached && Date.now() - cached.at < LIVE_TTL_MS) return cached.value;

  const raw = await call<RawFixture[]>("/fixtures?live=all");
  if (!raw) return cached?.value ?? [];

  const mapped: UpstreamFixture[] = [];

  for (const f of raw) {
    if (isMinorCompetition(f.league?.name ?? "")) continue;
    if (isFinished(f.fixture.status.short)) continue;
    mapped.push(toFixture(f));
    if (mapped.length >= 80) break;
  }

  cache.set("live", { at: Date.now(), value: mapped });
  return mapped;
}

/** Upstream fixtures for a date (YYYY-MM-DD), whitelisted and cached. */
export async function fetchFixtures(date: string): Promise<UpstreamFixture[]> {
  const cached = cache.get(date);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  const raw = await call<RawFixture[]>(`/fixtures?date=${date}`);
  if (!raw) {
    // Serve stale rather than nothing when upstream blips.
    return cached?.value ?? [];
  }

  const allowed = new Set<number>(LEAGUE_WHITELIST);
  const mapped: UpstreamFixture[] = raw
    .filter((f) => allowed.has(f.league.id))
    .filter((f) => !isFinished(f.fixture.status.short))
    .map(toFixture);

  cache.set(date, { at: Date.now(), value: mapped });
  return mapped;
}

interface RawOdds {
  fixture: { id: number };
  bookmakers: { bets: { name: string; values: { value: string; odd: string }[] }[] }[];
}

/**
 * Odds paging and cache.
 *
 * Upstream returns ten fixtures per page and runs to ~30 pages a day across
 * all competitions, so pricing the whole board means walking the lot. That is
 * too many requests to repeat on the 60-second fixture cadence, and pre-match
 * prices do not move that fast — so odds get their own, much longer cache.
 *
 * Budget: 40 pages x 2 dates per 10 minutes is about 11.5k requests a day,
 * comfortably inside the plan's daily allowance.
 */
const ODDS_MAX_PAGES = 40;
const ODDS_TTL_MS = 10 * 60_000;

const oddsCache = new Map<string, { at: number; value: Map<string, { home: number; draw: number; away: number }> }>();

/**
 * 1X2 prices for a date, keyed by fixture id.
 *
 * The upstream odds endpoint paginates at ten fixtures a page, so a single
 * request prices only a handful of the day's card and everything else falls
 * back to a synthetic price, so every page is walked and the result is held in
 * its own longer-lived cache.
 */
export async function fetchOdds(date: string): Promise<Map<string, { home: number; draw: number; away: number }>> {
  const cached = oddsCache.get(date);
  if (cached && Date.now() - cached.at < ODDS_TTL_MS) return cached.value;

  const out = new Map<string, { home: number; draw: number; away: number }>();

  const first = await callPaged(`/odds?date=${date}&bet=1&page=1`);
  if (!first) return cached?.value ?? out;

  collectOdds(first.response, out);

  const total = Math.min(ODDS_MAX_PAGES, first.paging?.total ?? 1);
  if (total > 1) {
    const rest = await Promise.all(
      Array.from({ length: total - 1 }, (_, i) => callPaged(`/odds?date=${date}&bet=1&page=${i + 2}`)),
    );
    for (const page of rest) {
      if (page) collectOdds(page.response, out);
    }
  }

  oddsCache.set(date, { at: Date.now(), value: out });
  return out;
}

interface Paged {
  response: RawOdds[];
  paging?: { current: number; total: number };
}

async function callPaged(path: string): Promise<Paged | null> {
  const k = key();
  if (!k) return null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "x-apisports-key": k },
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      console.error("[api-football]", path, res.status);
      return null;
    }
    return (await res.json()) as Paged;
  } catch (err) {
    console.error("[api-football] threw", path, err);
    return null;
  }
}

function collectOdds(
  entries: RawOdds[] | undefined,
  out: Map<string, { home: number; draw: number; away: number }>,
): void {
  for (const entry of entries ?? []) {
    const market = entry.bookmakers?.[0]?.bets?.find((b) => b.name === "Match Winner");
    if (!market) continue;
    const find = (v: string) => Number(market.values.find((x) => x.value === v)?.odd ?? 0);
    const home = find("Home");
    const draw = find("Draw");
    const away = find("Away");
    if (home > 1 && draw > 1 && away > 1) {
      out.set(String(entry.fixture.id), { home, draw, away });
    }
  }
}

/**
 * Fallback prices for a fixture upstream did not price. Deterministic per
 * fixture id so the number does not jitter between polls.
 */
export function syntheticOdds(fixtureId: string): { home: number; draw: number; away: number } {
  let h = 0;
  for (let i = 0; i < fixtureId.length; i++) h = (h * 31 + fixtureId.charCodeAt(i)) >>> 0;
  const bias = (h % 100) / 100; // 0..1
  const home = 1.5 + bias * 2.6;
  const away = 1.5 + (1 - bias) * 2.6;
  const draw = 3.0 + Math.abs(0.5 - bias) * 1.6;
  const r = (n: number) => Math.round(n * 100) / 100;
  return { home: r(home), draw: r(draw), away: r(away) };
}


// --------------------------------------------------------- per-fixture odds

import type { RawBookmaker } from "./markets";

/**
 * Every market for a single fixture.
 *
 * The board only needs 1X2, so this is fetched on demand when a player opens a
 * match — one request per view, cached for the same 60 seconds. Asking for the
 * full market set across the whole card would be far too many requests.
 */
const fixtureOddsCache = new Map<string, { at: number; value: RawBookmaker[] }>();

const fixtureByIdCache = new Map<string, { at: number; value: UpstreamFixture | null }>();

/**
 * One fixture by id, for a match that is no longer on the board.
 *
 * The live feed carries any league being played right now, while the dated
 * feed carries only the whitelist — so a match can enter the board through a
 * door it cannot come back through, and a slip built on it would be stuck
 * forever once the match left the live window. Asking upstream for the single
 * fixture settles it either way: still to play, or finished.
 *
 * Returns null for a finished fixture, which is the honest answer to "can this
 * still be bet on" and keeps the caller from having to know the status codes.
 */
export async function fetchFixtureById(fixtureId: string): Promise<UpstreamFixture | null> {
  const cached = fixtureByIdCache.get(fixtureId);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  const raw = await call<RawFixture[]>(`/fixtures?id=${encodeURIComponent(fixtureId)}`);
  if (!raw) return cached?.value ?? null;

  const f = raw[0];
  const value = f && !isFinished(f.fixture.status.short) ? toFixture(f) : null;

  // Keep the cache from growing without bound on a long-running instance.
  if (fixtureByIdCache.size > 200) fixtureByIdCache.clear();
  fixtureByIdCache.set(fixtureId, { at: Date.now(), value });

  return value;
}

export async function fetchFixtureOdds(fixtureId: string): Promise<RawBookmaker[]> {
  const cached = fixtureOddsCache.get(fixtureId);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  const raw = await call<{ bookmakers: RawBookmaker[] }[]>(`/odds?fixture=${encodeURIComponent(fixtureId)}`);
  if (!raw) return cached?.value ?? [];

  const bookmakers = raw[0]?.bookmakers ?? [];

  // Keep the cache from growing without bound on a long-running instance.
  if (fixtureOddsCache.size > 200) fixtureOddsCache.clear();
  fixtureOddsCache.set(fixtureId, { at: Date.now(), value: bookmakers });

  return bookmakers;
}
