import { db, missingColumn } from "./supabase";

/**
 * Operator fixtures.
 *
 * The admin console and an approved partner both create these. A partner only
 * sees and changes the rows they created, once `created_by` exists. On a
 * database that has not added that column yet, the write is retried without
 * it and the partner shares the same list as the operator.
 */

export interface MatchBody {
  id?: string;
  home_team?: string;
  away_team?: string;
  home_crest?: string | null;
  away_crest?: string | null;
  league?: string;
  sport?: string;
  kickoff?: string;
  odds_home?: number;
  odds_draw?: number;
  odds_away?: number;
  goal_timeline?: unknown;
  is_live?: boolean;
  is_locked?: boolean;
  best_odds?: boolean;
  final_home?: number | null;
  final_away?: number | null;
}

type Goal = { minute: number; team: "home" | "away" };

function goals(value: unknown): Goal[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const goal = entry as { minute?: unknown; team?: unknown };
      return {
        minute: Number(goal.minute),
        team: goal.team === "away" ? ("away" as const) : ("home" as const),
      };
    })
    .filter((goal) => Number.isInteger(goal.minute) && goal.minute >= 1 && goal.minute <= 120)
    .slice(0, 40);
}

function price(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 1 ? n : fallback;
}

export async function listCustomMatches(ownerId: string | null) {
  const supabase = db();
  if (!supabase) return { ok: false as const, status: 503, error: "Service unavailable" };

  let query = supabase.from("custom_matches").select("*").order("kickoff", { ascending: false }).limit(100);
  if (ownerId) query = query.eq("created_by", ownerId);

  let { data, error } = await query;
  if (ownerId && missingColumn(error, "created_by")) {
    const again = await supabase
      .from("custom_matches")
      .select("*")
      .order("kickoff", { ascending: false })
      .limit(100);
    data = again.data;
    error = again.error;
  }

  if (error) {
    console.error("[custom-matches] list", error);
    return { ok: false as const, status: 500, error: "Could not load matches" };
  }
  return { ok: true as const, matches: data ?? [] };
}

export async function createCustomMatch(body: MatchBody | null, ownerId: string | null) {
  const supabase = db();
  if (!supabase) return { ok: false as const, status: 503, error: "Service unavailable" };

  if (!body?.home_team?.trim() || !body?.away_team?.trim() || !body?.kickoff) {
    return { ok: false as const, status: 400, error: "Teams and kickoff are required" };
  }
  const league = body.league?.trim() ?? "";
  if (!league) {
    return { ok: false as const, status: 400, error: "A league name is required" };
  }

  const kickoff = new Date(body.kickoff);
  if (Number.isNaN(kickoff.getTime())) {
    return { ok: false as const, status: 400, error: "Kickoff is not a valid time" };
  }

  const row: Record<string, unknown> = {
    home_team: body.home_team.trim(),
    away_team: body.away_team.trim(),
    home_crest: body.home_crest || null,
    away_crest: body.away_crest || null,
    league,
    sport: body.sport || "football",
    kickoff: kickoff.toISOString(),
    odds_home: price(body.odds_home, 2),
    odds_draw: price(body.odds_draw, 3.2),
    odds_away: price(body.odds_away, 3.5),
    goal_timeline: goals(body.goal_timeline),
    is_live: Boolean(body.is_live),
    is_locked: Boolean(body.is_locked),
    best_odds: Boolean(body.best_odds),
  };
  if (ownerId) row.created_by = ownerId;

  let { data, error } = await supabase.from("custom_matches").insert(row).select("*").single();
  if (missingColumn(error, "created_by")) {
    delete row.created_by;
    const again = await supabase.from("custom_matches").insert(row).select("*").single();
    data = again.data;
    error = again.error;
  }

  if (error) {
    console.error("[custom-matches] insert", error);
    return { ok: false as const, status: 500, error: "Could not create the match" };
  }
  return { ok: true as const, match: data };
}

const PATCH_FIELDS = [
  "home_team",
  "away_team",
  "home_crest",
  "away_crest",
  "league",
  "kickoff",
  "odds_home",
  "odds_draw",
  "odds_away",
  "goal_timeline",
  "is_live",
  "is_locked",
  "best_odds",
] as const;

export async function updateCustomMatch(body: MatchBody | null, ownerId: string | null) {
  const supabase = db();
  if (!supabase) return { ok: false as const, status: 503, error: "Service unavailable" };
  if (!body?.id) return { ok: false as const, status: 400, error: "Invalid request" };

  const patch: Record<string, unknown> = {};
  for (const field of PATCH_FIELDS) {
    if (!(field in body)) continue;
    if (field === "goal_timeline") patch.goal_timeline = goals(body.goal_timeline);
    else if (field === "odds_home") patch.odds_home = price(body.odds_home, 2);
    else if (field === "odds_draw") patch.odds_draw = price(body.odds_draw, 3.2);
    else if (field === "odds_away") patch.odds_away = price(body.odds_away, 3.5);
    else if (field === "kickoff") {
      const kickoff = new Date(String(body.kickoff));
      if (Number.isNaN(kickoff.getTime())) {
        return { ok: false as const, status: 400, error: "Kickoff is not a valid time" };
      }
      patch.kickoff = kickoff.toISOString();
    } else if (field === "home_team" || field === "away_team" || field === "league") {
      const text = String(body[field] ?? "").trim();
      if (!text) return { ok: false as const, status: 400, error: "That name cannot be empty" };
      patch[field] = text;
    } else {
      patch[field] = body[field];
    }
  }

  // "Set result" finalises the match; settlement then treats that score as
  // authoritative rather than deriving one from the timeline.
  if (body.final_home != null && body.final_away != null) {
    patch.final_home = Number(body.final_home);
    patch.final_away = Number(body.final_away);
    patch.finished = true;
    patch.is_live = false;
  }

  const apply = (owned: boolean) => {
    let query = supabase.from("custom_matches").update(patch).eq("id", body.id);
    if (owned && ownerId) query = query.eq("created_by", ownerId);
    return query.select("*").maybeSingle();
  };

  let { data, error } = await apply(Boolean(ownerId));
  if (ownerId && missingColumn(error, "created_by")) {
    const again = await apply(false);
    data = again.data;
    error = again.error;
  }

  if (error) return { ok: false as const, status: 500, error: "Could not update the match" };
  if (!data) return { ok: false as const, status: 404, error: "That match was not found" };
  return { ok: true as const, match: data };
}

export async function deleteCustomMatch(id: string | null, ownerId: string | null) {
  const supabase = db();
  if (!supabase) return { ok: false as const, status: 503, error: "Service unavailable" };
  if (!id) return { ok: false as const, status: 400, error: "Invalid request" };

  // A ticket on a custom match is settled from this row. Deleting it while a
  // ticket is still open leaves that ticket pending forever, so the match has
  // to be finalised (or finish on the clock) and settle first.
  const { data: onMatch, error: legsError } = await supabase
    .from("bet_selections")
    .select("bet_id")
    .eq("match_id", `cm_${id}`)
    .limit(1000);
  if (legsError) return { ok: false as const, status: 500, error: "Could not check tickets on this match" };
  const betIds = [...new Set((onMatch ?? []).map((l) => l.bet_id))];
  if (betIds.length) {
    const { count, error: betsError } = await supabase
      .from("bets")
      .select("id", { count: "exact", head: true })
      .in("id", betIds)
      .eq("status", "pending");
    if (betsError) return { ok: false as const, status: 500, error: "Could not check tickets on this match" };
    if (count) {
      return {
        ok: false as const,
        status: 409,
        error: `${count} open ticket${count === 1 ? " is" : "s are"} on this match. Finalise the result so they settle, then delete it.`,
      };
    }
  }

  const apply = (owned: boolean) => {
    let query = supabase.from("custom_matches").delete().eq("id", id);
    if (owned && ownerId) query = query.eq("created_by", ownerId);
    return query.select("id");
  };

  let { data, error } = await apply(Boolean(ownerId));
  if (ownerId && missingColumn(error, "created_by")) {
    const again = await apply(false);
    data = again.data;
    error = again.error;
  }

  if (error) return { ok: false as const, status: 500, error: "Could not delete the match" };
  if (!data?.length) return { ok: false as const, status: 404, error: "That match was not found" };
  return { ok: true as const };
}
