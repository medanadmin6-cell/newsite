import { db } from "./supabase";
import { matchClock } from "./clock";

/**
 * Match tracker data: what has actually happened in a match.
 *
 * Upstream fixtures carry a real event feed — goals, cards, substitutions with
 * the minute and the player. Operator fixtures have their scripted goal
 * timeline, which is the same shape once translated, so both kinds of match
 * render through one view.
 *
 * Statistics are frequently absent (early in a match, or simply not covered for
 * a competition), so they are optional throughout rather than assumed.
 */

const BASE = "https://v3.football.api-sports.io";
const TTL_MS = 20_000;

export type EventKind = "goal" | "card" | "sub" | "var" | "other";

export interface TrackerEvent {
  minute: number;
  extra: number | null;
  kind: EventKind;
  /** "Normal Goal", "Yellow Card", "Substitution 1" and so on. */
  detail: string;
  side: "home" | "away";
  player: string | null;
  assist: string | null;
}

export interface TrackerStat {
  label: string;
  home: string | number | null;
  away: string | number | null;
}

export interface Tracker {
  events: TrackerEvent[];
  stats: TrackerStat[];
}

const cache = new Map<string, { at: number; value: Tracker }>();

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
    if (!res.ok) return null;
    return ((await res.json())?.response ?? null) as T | null;
  } catch {
    return null;
  }
}

export function classifyEvent(type: string, detail: string): EventKind {
  const t = (type || "").toLowerCase();
  const d = (detail || "").toLowerCase();

  if (t === "goal") {
    // The feed files a missed penalty under Goal. Counting it as one puts more
    // markers on the pitch than the scoreline has goals, which was visible the
    // moment it was drawn.
    if (d.includes("missed")) return "other";
    return "goal";
  }
  if (t === "card") return "card";
  if (t === "subst") return "sub";
  if (t === "var") return "var";
  return "other";
}

interface RawEvent {
  time: { elapsed: number | null; extra: number | null };
  team: { id: number; name: string };
  player: { name: string | null } | null;
  assist: { name: string | null } | null;
  type: string;
  detail: string;
}

interface RawStatBlock {
  team: { id: number };
  statistics: { type: string; value: string | number | null }[];
}

/** The tracker for an upstream fixture, keyed by its API-Football id. */
async function upstreamTracker(fixtureId: string, homeTeamId: number | null): Promise<Tracker> {
  const [rawEvents, rawStats] = await Promise.all([
    call<RawEvent[]>(`/fixtures/events?fixture=${encodeURIComponent(fixtureId)}`),
    call<RawStatBlock[]>(`/fixtures/statistics?fixture=${encodeURIComponent(fixtureId)}`),
  ]);

  // Which side an event belongs to is decided by the home team id, which the
  // events feed does not repeat — so it is taken from the first stats block, or
  // from the first team seen, whichever is available.
  const homeId =
    homeTeamId ?? rawStats?.[0]?.team?.id ?? rawEvents?.[0]?.team?.id ?? null;

  const events: TrackerEvent[] = (rawEvents ?? [])
    .filter((e) => e.time?.elapsed !== null && e.time?.elapsed !== undefined)
    .map((e) => ({
      minute: Number(e.time.elapsed),
      extra: e.time.extra ?? null,
      kind: classifyEvent(e.type, e.detail ?? ""),
      detail: e.detail ?? e.type ?? "",
      side: (homeId !== null && e.team.id === homeId ? "home" : "away") as "home" | "away",
      player: e.player?.name ?? null,
      assist: e.assist?.name ?? null,
    }))
    .sort((a, b) => a.minute - b.minute || (a.extra ?? 0) - (b.extra ?? 0));

  const stats: TrackerStat[] = [];
  if (rawStats && rawStats.length >= 2) {
    for (const s of rawStats[0].statistics ?? []) {
      const away = rawStats[1].statistics?.find((x) => x.type === s.type);
      if (s.value === null && (away?.value ?? null) === null) continue;
      stats.push({ label: s.type, home: s.value, away: away?.value ?? null });
    }
  }

  return { events, stats };
}

/** The tracker for an operator fixture, read off its scripted timeline. */
async function customTracker(rawId: string): Promise<Tracker> {
  const supabase = db();
  if (!supabase) return { events: [], stats: [] };

  const { data } = await supabase
    .from("custom_matches")
    .select("kickoff, sport, goal_timeline")
    .eq("id", rawId)
    .maybeSingle();

  if (!data) return { events: [], stats: [] };

  const clock = matchClock(data.kickoff, data.sport ?? "football");
  const timeline = (data.goal_timeline ?? []) as { minute: number; team: "home" | "away" }[];

  // Only goals that have actually happened by the current minute are shown; a
  // scripted goal still to come is not something the player should see.
  const cutoff = clock.isOver ? Number.POSITIVE_INFINITY : clock.minute;

  const events: TrackerEvent[] = timeline
    .filter((g) => g.minute <= cutoff)
    .sort((a, b) => a.minute - b.minute)
    .map((g) => ({
      minute: g.minute,
      extra: null,
      kind: "goal" as const,
      detail: "Goal",
      side: g.team,
      player: null,
      assist: null,
    }));

  return { events, stats: [] };
}

export async function getTracker(matchId: string, homeTeamId: number | null = null): Promise<Tracker> {
  const cached = cache.get(matchId);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  const value = matchId.startsWith("cm_")
    ? await customTracker(matchId.slice(3))
    : await upstreamTracker(matchId, homeTeamId);

  if (cache.size > 200) cache.clear();
  cache.set(matchId, { at: Date.now(), value });
  return value;
}
