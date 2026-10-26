import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-guard";
import { settleBets } from "@/lib/settle";

export const dynamic = "force-dynamic";

/** Every ticket on the platform. Opening this list settles everything first. */
export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const report = await settleBets({ force: true }).catch((err) => {
    console.error("[admin] settle failed", err);
    return null;
  });

  const status = new URL(req.url).searchParams.get("status");

  let query = supabase
    .from("bets")
    .select("id, code, stake, total_odds, potential_win, currency, status, payout, settled_at, created_at, users!inner(id, name, phone)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (status && status !== "all") query = query.eq("status", status);

  const { data: bets } = await query;
  if (!bets?.length) return NextResponse.json({ bets: [], report });

  const { data: legs } = await supabase
    .from("bet_selections")
    .select("bet_id, match_id, home_team, away_team, market, outcome, odds, result, final_home, final_away")
    .in("bet_id", bets.map((b) => b.id));

  const byTicket = new Map<string, unknown[]>();
  for (const leg of legs ?? []) {
    const list = byTicket.get(leg.bet_id) ?? [];
    list.push(leg);
    byTicket.set(leg.bet_id, list);
  }

  return NextResponse.json({
    bets: bets.map((b) => ({ ...b, selections: byTicket.get(b.id) ?? [] })),
    report,
  });
}
