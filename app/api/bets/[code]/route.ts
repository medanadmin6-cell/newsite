import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { getMatchDetail } from "@/lib/fixtures";
import { resolveSelection } from "@/lib/resolve";
import { cashoutOffer, type CashoutLeg } from "@/lib/cashout";
import { settleBets } from "@/lib/settle";
import { cashoutEnabled } from "@/lib/schema";

export const dynamic = "force-dynamic";

/**
 * One ticket, with its legs and the live cashout offer.
 *
 * Settlement runs first for this player, so the detail view never shows a leg
 * as pending that the platform has already judged.
 */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const { code } = await ctx.params;
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  await settleBets({ userId }).catch(() => {});

  // Selected with * rather than a column list: naming a column the database
  // has not been migrated to yet makes PostgREST reject the whole query, and a
  // missing migration would then be indistinguishable from a missing ticket.
  const { data: bet, error: betErr } = await supabase
    .from("bets")
    .select("*")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (betErr) {
    console.error("[ticket] query failed", code, betErr);
    return NextResponse.json({ error: "Could not load this ticket" }, { status: 500 });
  }
  if (!bet) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  if (bet.user_id !== userId) {
    return NextResponse.json({ error: "That is not your ticket" }, { status: 403 });
  }

  const { data: owner } = await supabase
    .from("users")
    .select("name")
    .eq("id", bet.user_id)
    .maybeSingle();

  const { data: legs } = await supabase
    .from("bet_selections")
    .select("id, match_id, home_team, away_team, league, sport, kickoff, market, outcome, odds, result, final_home, final_away")
    .eq("bet_id", bet.id);

  const selections = legs ?? [];

  // Price the open legs so the ticket can be valued.
  const cashLegs: CashoutLeg[] = [];
  const live: Record<
    string,
    {
      currentOdds: number | null;
      isLive: boolean;
      liveHome: number | null;
      liveAway: number | null;
      minuteLabel: string | null;
    }
  > = {};

  if (bet.status === "pending") {
    const matches = await Promise.all(
      [...new Set(selections.map((l) => l.match_id))].map((id) => getMatchDetail(id)),
    );
    const byId = new Map(matches.filter((m) => m !== null).map((m) => [m.id, m]));

    for (const leg of selections) {
      const match = byId.get(leg.match_id);
      const resolved = match ? resolveSelection(match.markets, leg.market, leg.outcome) : null;

      // The running score, so a ticket on an in-play match shows what is
      // happening rather than a pair of dashes. final_home is only written at
      // settlement, so it is null for the whole time a player most wants to look.
      live[leg.id] = {
        currentOdds: resolved?.price.odds ?? null,
        isLive: Boolean(match?.isLive),
        liveHome: match?.scoreHome ?? null,
        liveAway: match?.scoreAway ?? null,
        minuteLabel: match?.isLive ? (match.minuteLabel || null) : null,
      };

      cashLegs.push({
        state: leg.result === "won" ? "won" : leg.result === "lost" ? "lost" : "pending",
        odds: Number(leg.odds),
        currentOdds: resolved?.price.odds ?? null,
        live: Boolean(match?.isLive),
      });
    }
  }

  // Cashout needs columns from a later migration; without them the feature is
  // simply not offered rather than breaking the page.
  const canCashout = await cashoutEnabled();

  const offer =
    bet.status === "pending" && canCashout
      ? cashoutOffer(Number(bet.stake), Number(bet.potential_win), cashLegs)
      : {
          available: false,
          amount: 0,
          potential: Number(bet.potential_win),
          reason: bet.status === "pending" ? "unavailable" : "already-decided",
        };

  return NextResponse.json({
    bet: {
      ...bet,
      bonus: bet.bonus ?? 0,
      mode: bet.mode ?? "multiple",
      cashout_amount: bet.cashout_amount ?? null,
    },
    owner: { name: owner?.name ?? null },
    selections: selections.map((l) => ({ ...l, ...(live[l.id] ?? {}) })),
    cashout: offer,
  });
}
