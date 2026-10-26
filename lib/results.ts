/**
 * Match results for settlement.
 *
 * Everything here is deliberately conservative: a result is only returned when
 * the fixture is genuinely finished and the numbers are present. Anything
 * missing comes back as null, and the judge leaves those legs pending rather
 * than guessing. A wrong settlement moves real money.
 */

const BASE = "https://v3.football.api-sports.io";
const TTL_MS = 5 * 60_000;

export interface MatchResult {
  /** Full-time score. */
  home: number;
  away: number;
  /** Half-time score, when the feed carries it. */
  htHome: number | null;
  htAway: number | null;
  /** Corner counts, fetched separately and often absent. */
  cornersHome: number | null;
  cornersAway: number | null;
  /** True only for a normal finish; a void fixture never settles. */
  finished: boolean;
}

const cache = new Map<string, { at: number; value: MatchResult }>();

function key(): string | null {
  return process.env.API_FOOTBALL_KEY || null;
}

async function call<T>(path: string): Promise<T | null> {
  const k = key();
  if (!k) return null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "x-apisports-key": k },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[results]", path, res.status);
      return null;
    }
    const json = (await res.json()) as { response?: T };
    return (json.response ?? null) as T | null;
  } catch (err) {
    console.error("[results] threw", path, err);
    return null;
  }
}

/** Statuses that mean the match played to a normal conclusion. */
const SETTLED = new Set(["FT", "AET", "PEN"]);

interface RawFixture {
  fixture: { id: number; status: { short: string } };
  goals: { home: number | null; away: number | null };
  score: {
    halftime: { home: number | null; away: number | null };
    fulltime: { home: number | null; away: number | null };
  };
}

/**
 * Results for a batch of fixture ids. API-Football takes up to twenty ids per
 * request, joined with dashes.
 */
export async function fetchResults(ids: string[]): Promise<Map<string, MatchResult>> {
  const out = new Map<string, MatchResult>();
  const wanted: string[] = [];

  for (const id of ids) {
    const hit = cache.get(id);
    if (hit && Date.now() - hit.at < TTL_MS) out.set(id, hit.value);
    else wanted.push(id);
  }

  if (!wanted.length || !key()) return out;

  for (let i = 0; i < wanted.length; i += 20) {
    const batch = wanted.slice(i, i + 20);
    const raw = await call<RawFixture[]>(`/fixtures?ids=${batch.join("-")}`);
    if (!raw) continue;

    for (const f of raw) {
      const id = String(f.fixture.id);
      const status = f.fixture.status.short;

      // Only a normal finish settles. Abandoned, cancelled and postponed
      // fixtures are the operator's call, not ours.
      if (!SETTLED.has(status)) continue;

      // Prefer the explicit full-time score; fall back to the goals block.
      const home = f.score?.fulltime?.home ?? f.goals?.home;
      const away = f.score?.fulltime?.away ?? f.goals?.away;
      if (home === null || away === null || home === undefined || away === undefined) continue;

      const value: MatchResult = {
        home: Number(home),
        away: Number(away),
        htHome: f.score?.halftime?.home ?? null,
        htAway: f.score?.halftime?.away ?? null,
        cornersHome: null,
        cornersAway: null,
        finished: true,
      };

      cache.set(id, { at: Date.now(), value });
      out.set(id, value);
    }
  }

  return out;
}

interface RawStat {
  team: { id: number };
  statistics: { type: string; value: number | string | null }[];
}

/**
 * Corner counts for one fixture, folded into an existing result.
 *
 * This is a separate upstream call, so it is only made when a ticket actually
 * has a corners leg riding on it.
 */
export async function attachCorners(fixtureId: string, result: MatchResult): Promise<MatchResult> {
  if (result.cornersHome !== null) return result;

  const raw = await call<RawStat[]>(`/fixtures/statistics?fixture=${encodeURIComponent(fixtureId)}`);
  if (!raw || raw.length < 2) return result;

  const read = (entry: RawStat): number | null => {
    const stat = entry.statistics?.find((s) => s.type === "Corner Kicks");
    const v = stat?.value;
    return v === null || v === undefined ? null : Number(v);
  };

  const home = read(raw[0]);
  const away = read(raw[1]);
  if (home === null || away === null) return result;

  const merged = { ...result, cornersHome: home, cornersAway: away };
  cache.set(fixtureId, { at: Date.now(), value: merged });
  return merged;
}
