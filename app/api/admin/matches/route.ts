import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

/** Operator corrections layered over upstream API fixtures. */
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const { data } = await supabase.from("match_overrides").select("*").order("updated_at", { ascending: false });
  return NextResponse.json({ overrides: data ?? [] });
}

export async function PUT(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const body = await req.json().catch(() => null);
  if (!body?.match_id) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { data, error } = await supabase
    .from("match_overrides")
    .upsert(
      {
        match_id: String(body.match_id),
        score_home: body.score_home ?? null,
        score_away: body.score_away ?? null,
        minute: body.minute ?? null,
        is_live: body.is_live ?? null,
        is_locked: body.is_locked ?? null,
        postponed: body.postponed ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "match_id" },
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "Could not save the override" }, { status: 500 });
  return NextResponse.json({ override: data });
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const id = new URL(req.url).searchParams.get("match_id");
  if (!id) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  await supabase.from("match_overrides").delete().eq("match_id", id);
  return NextResponse.json({ ok: true });
}
