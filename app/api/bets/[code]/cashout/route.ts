import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { getMatchDetail } from "@/lib/fixtures";
import { resolveSelection } from "@/lib/resolve";
import { cashoutOffer, refusalMessage, type CashoutLeg } from "@/lib/cashout";
import { cashoutEnabled } from "@/lib/schema";

/**
 * Accept a cashout.
 *
 * The offer is recomputed here from live prices rather than trusted from the
 * client, because a price can move between the screen and the tap. The client
 * sends what it was shown; if the real value has dropped below that by more
 * than a hair, the request is refused and the new number returned.
 *
 * The ticket then leaves the pending pool through a guarded transition — the
 * same mechanism that stops a win being paid twice.
 */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const { code } = await ctx.params;
  const body = await req.json().catch(() => null);
  const userId = body?.userId;
  const expected = Number(body?.expected);

  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Without the columns from migration 0011 there is nowhere to record the
  // amount, and a cashout with no record is not one worth taking.
  if (!(await cashoutEnabled())) {
    return NextResponse.json(
      { error: "Cashout is not enabled on this deployment yet." },
      { status: 503 },
    );
  }

  const { data: bet } = await supabase
    .from("bets")
    .select("id, code, user_id, stake, potential_win, currency, status")
    .eq("code", String(code).toUpperCase())
    .maybeSingle();

  if (!bet) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  if (bet.user_id !== userId) {
    return NextResponse.json({ error: "That is not your ticket" }, { status: 403 });
  }
  if (bet.status !== "pending") {
    return NextResponse.json({ error: "This ticket is already decided." }, { status: 409 });
  }

  const { data: legs } = await supabase
    .from("bet_selections")
    .select("match_id, market, outcome, odds, result")
    .eq("bet_id", bet.id);

  if (!legs?.length) return NextResponse.json({ error: "This ticket has no legs" }, { status: 409 });

  // --- Value it from live prices ------------------------------------------
  const matches = await Promise.all(
    [...new Set(legs.map((l) => l.match_id))].map((id) => getMatchDetail(id)),
  );
  const byId = new Map(matches.filter((m) => m !== null).map((m) => [m.id, m]));

  const cashLegs: CashoutLeg[] = legs.map((leg) => {
    const match = byId.get(leg.match_id);
    const resolved = match ? resolveSelection(match.markets, leg.market, leg.outcome) : null;
    return {
      state: leg.result === "won" ? "won" : leg.result === "lost" ? "lost" : "pending",
      odds: Number(leg.odds),
      currentOdds: resolved?.price.odds ?? null,
      live: Boolean(match?.isLive),
    };
  });

  const offer = cashoutOffer(Number(bet.stake), Number(bet.potential_win), cashLegs);

  if (!offer.available) {
    return NextResponse.json({ error: refusalMessage(offer.reason) }, { status: 409 });
  }

  // A drop of more than a penny means the player is looking at a stale number.
  if (Number.isFinite(expected) && offer.amount < expected - 0.01) {
    return NextResponse.json(
      {
        error: `The cashout value moved to ${offer.amount.toFixed(2)}.`,
        amount: offer.amount,
        moved: true,
      },
      { status: 409 },
    );
  }

  // --- Close the ticket, then pay -----------------------------------------
  // Only the run that transitions it out of pending pays out, so a double tap
  // cannot be paid twice.
  const { data: closed } = await supabase
    .from("bets")
    .update({
      status: "cashed_out",
      cashout_amount: offer.amount,
      cashed_out_at: new Date().toISOString(),
      settled_at: new Date().toISOString(),
      payout: offer.amount,
    })
    .eq("id", bet.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (!closed) {
    return NextResponse.json({ error: "This ticket is already decided." }, { status: 409 });
  }

  const { data: user } = await supabase
    .from("users")
    .select("balance")
    .eq("id", userId)
    .single();

  const balance = Number(user?.balance ?? 0);
  const next = Math.round((balance + offer.amount) * 100) / 100;

  const { error: creditErr } = await supabase
    .from("users")
    .update({ balance: next })
    .eq("id", userId);

  if (creditErr) {
    // The ticket is closed but the money did not land. Loud, because it needs
    // a human: reopening would risk paying it twice through settlement.
    console.error("[cashout] CREDIT FAILED AFTER CLOSING TICKET", {
      code: bet.code,
      userId,
      amount: offer.amount,
      creditErr,
    });
    return NextResponse.json(
      { error: "Your cashout was accepted but the credit failed. Contact support with this ticket." },
      { status: 500 },
    );
  }

  console.info("[cashout] paid", { code: bet.code, amount: offer.amount, currency: bet.currency });

  return NextResponse.json({ ok: true, amount: offer.amount, balance: next });
}
