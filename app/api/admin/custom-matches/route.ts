import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

/** Operator fixtures: create, run and finalise. */
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const { data } = await supabase
    .from("custom_matches")
    .select("*")
    .order("kickoff", { ascending: false })
    .limit(100);

  return NextResponse.json({ matches: data ?? [] });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const body = await req.json().catch(() => null);
  if (!body?.home_team || !body?.away_team || !body?.kickoff) {
    return NextResponse.json({ error: "Teams and kickoff are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("custom_matches")
    .insert({
      home_team: body.home_team,
      away_team: body.away_team,
      home_crest: body.home_crest ?? null,
      away_crest: body.away_crest ?? null,
      league: body.league || "3btafric Special",
      sport: body.sport || "football",
      kickoff: body.kickoff,
      odds_home: Number(body.odds_home) || 2.0,
      odds_draw: Number(body.odds_draw) || 3.2,
      odds_away: Number(body.odds_away) || 3.5,
      goal_timeline: body.goal_timeline ?? [],
      is_live: Boolean(body.is_live),
      is_locked: Boolean(body.is_locked),
      best_odds: Boolean(body.best_odds),
    })
    .select("*")
    .single();

  if (error) {
    console.error("[admin] custom match insert", error);
    return NextResponse.json({ error: "Could not create the match" }, { status: 500 });
  }
  return NextResponse.json({ match: data });
}

export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  for (const field of [
    "home_team", "away_team", "home_crest", "away_crest", "league", "kickoff",
    "odds_home", "odds_draw", "odds_away", "goal_timeline",
    "is_live", "is_locked", "best_odds",
  ]) {
    if (field in body) patch[field] = body[field];
  }

  // "Set result" finalises the match; settlement then treats that score as
  // authoritative rather than deriving one from the timeline.
  if (body.final_home != null && body.final_away != null) {
    patch.final_home = Number(body.final_home);
    patch.final_away = Number(body.final_away);
    patch.finished = true;
    patch.is_live = false;
  }

  const { data, error } = await supabase
    .from("custom_matches")
    .update(patch)
    .eq("id", body.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "Could not update the match" }, { status: 500 });
  return NextResponse.json({ match: data });
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  await supabase.from("custom_matches").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
