import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { settleBets } from "@/lib/settle";

export const dynamic = "force-dynamic";

/**
 * A player's tickets. Opening My Bets settles that player's own tickets first,
 * so the list they are about to read is already up to date.
 */
export async function GET(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  await settleBets({ userId }).catch((err) => console.error("[my-bets] settle failed", err));

  const { data: bets, error } = await supabase
    .from("bets")
    .select("id, code, stake, total_odds, potential_win, currency, status, payout, settled_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: "Could not load your bets" }, { status: 500 });

  // Counted rather than derived from the list above, which is capped at 100:
  // a player past that cap would otherwise see the My Bets badge under-report.
  // Settlement has already run, so this is the count after today's results.
  const { count: openBets } = await supabase
    .from("bets")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "pending");

  if (!bets?.length) return NextResponse.json({ bets: [], openBets: openBets ?? 0 });

  const { data: legs } = await supabase
    .from("bet_selections")
    .select("bet_id, match_id, home_team, away_team, league, market, outcome, odds, result, kickoff, final_home, final_away")
    .in("bet_id", bets.map((b) => b.id));

  const byTicket = new Map<string, unknown[]>();
  for (const leg of legs ?? []) {
    const list = byTicket.get(leg.bet_id) ?? [];
    list.push(leg);
    byTicket.set(leg.bet_id, list);
  }

  return NextResponse.json({
    bets: bets.map((b) => ({ ...b, selections: byTicket.get(b.id) ?? [] })),
    openBets: openBets ?? 0,
  });
}
