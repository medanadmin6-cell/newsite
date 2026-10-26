import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { ticketCode, bookingCode } from "@/lib/codes";
import { getMatchDetail } from "@/lib/fixtures";
import { upstreamUnavailable } from "@/lib/api-football";
import { bonusAmount, combinations, systemSizes } from "@/lib/bonus";
import { resolveSelection } from "@/lib/resolve";

interface IncomingLeg {
  matchId: string;
  market: string;
  outcome: string;
  /** The price the slip was showing, so a drift can be caught before it costs. */
  odds?: number;
}

type Mode = "single" | "multiple" | "system";

const MAX_LEGS = 30;
const MAX_ODDS = 10_000;
const MAX_LINES = 200;

interface TicketRow {
  code: string;
  user_id: string;
  stake: number;
  total_odds: number;
  potential_win: number;
  bonus: number;
  currency: string;
  status: string;
  mode: Mode;
  group_code: string | null;
  legs: PricedLeg[];
}

interface PricedLeg {
  matchId: string;
  home: string;
  away: string;
  league: string;
  sport: string;
  kickoff: string;
  market: string;
  outcome: string;
  odds: number;
}

/** The ticket row, without the legs it was built from. */
function toInsert(row: TicketRow) {
  const { legs, ...rest } = row;
  void legs;
  return rest;
}

/**
 * Place a slip.
 *
 * Three modes, all writing the same shape:
 *   single   — one ticket per selection
 *   multiple — one ticket across every selection, eligible for the bonus
 *   system   — one ticket per combination of the chosen size
 *
 * Every line is its own ticket so it settles independently; lines from one slip
 * share a group code so the player still sees them together.
 *
 * The stake is the amount per line, and the total debited is stake x lines.
 * Money leaves the wallet before any ticket is written, and is returned in full
 * if the write then fails.
 *
 * Odds are re-read from the board rather than trusted from the client, so a
 * tampered slip cannot buy a better price than the board is showing.
 */
export async function POST(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  let body: {
    userId?: string;
    stake?: number;
    selections?: IncomingLeg[];
    mode?: Mode;
    systemSize?: number;
    acceptOddsChanges?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { userId } = body;
  const stake = Number(body.stake);
  const selections = body.selections ?? [];
  const mode: Mode = body.mode === "single" || body.mode === "system" ? body.mode : "multiple";

  if (!userId) return NextResponse.json({ error: "Sign in to place a bet" }, { status: 401 });
  if (!selections.length) return NextResponse.json({ error: "Your slip is empty" }, { status: 400 });
  if (selections.length > MAX_LEGS) {
    return NextResponse.json({ error: `A ticket can hold at most ${MAX_LEGS} legs` }, { status: 400 });
  }
  if (!Number.isFinite(stake) || stake <= 0) {
    return NextResponse.json({ error: "Enter a stake" }, { status: 400 });
  }

  // One leg per match: the same fixture cannot appear twice on a ticket.
  const matchIds = new Set(selections.map((s) => s.matchId));
  if (matchIds.size !== selections.length) {
    return NextResponse.json({ error: "You have two picks on the same match" }, { status: 400 });
  }

  if (mode === "multiple" && selections.length < 2) {
    return NextResponse.json({ error: "A multiple needs at least two selections" }, { status: 400 });
  }

  // --- Price the slip from the board, not from the client -----------------
  // Resolved through the same function the details page uses, so every market
  // a player can see is a market this endpoint will honour.
  const resolved = await Promise.all([...matchIds].map((id) => getMatchDetail(id)));
  const byId = new Map(resolved.filter((m) => m !== null).map((m) => [m.id, m]));

  const priced: PricedLeg[] = [];

  // The board carries a locally derived price where upstream did not price the
  // fixture in the paged sweep, so the real book price can differ by a lot. The
  // player is told before any money moves rather than being quietly charged a
  // different number.
  const changes: { match: string; from: number; to: number }[] = [];

  // Every missing leg at once, not just the first: a player told to fix one
  // match at a time has to submit again to find out about the next.
  const missing = selections.filter((leg) => !byId.has(leg.matchId)).map((leg) => leg.matchId);

  if (missing.length) {
    // A fixture absent because we could not reach upstream has not gone
    // anywhere, and telling the player it has would have them tear up a
    // perfectly good slip over a blip. That case is retryable; this one is not.
    if (upstreamUnavailable()) {
      return NextResponse.json(
        { error: "We cannot reach the odds feed right now. Your slip is saved — try again in a moment." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        error:
          missing.length === 1
            ? "A match on your slip has finished or been withdrawn, so it can no longer be priced."
            : `${missing.length} matches on your slip have finished or been withdrawn, so they can no longer be priced.`,
        // Named so the slip can offer to drop exactly these and leave the rest.
        unavailableMatchIds: missing,
      },
      { status: 409 },
    );
  }

  for (const leg of selections) {
    const match = byId.get(leg.matchId);
    if (!match) continue;
    if (match.isLocked || match.postponed) {
      return NextResponse.json(
        { error: `Betting is closed on ${match.homeTeam} v ${match.awayTeam}` },
        { status: 409 },
      );
    }

    // Matched on meaning, not on spelling: the board calls the match result
    // "1x2" with outcomes 1/X/2 while the real book calls it "af1" with
    // Home/Draw/Away. Without this, every bet placed from the board would be
    // rejected as no longer offered.
    const resolved = resolveSelection(match.markets, leg.market, leg.outcome);
    if (!resolved) {
      return NextResponse.json(
        { error: `${match.homeTeam} v ${match.awayTeam}: that selection is no longer offered` },
        { status: 409 },
      );
    }
    const { market, price } = resolved;

    const shown = Number(leg.odds);
    if (Number.isFinite(shown) && Math.abs(shown - price.odds) > 0.001) {
      changes.push({
        match: `${match.homeTeam} v ${match.awayTeam}`,
        from: shown,
        to: price.odds,
      });
    }

    priced.push({
      matchId: match.id,
      home: match.homeTeam,
      away: match.awayTeam,
      league: match.league,
      sport: match.sport,
      kickoff: match.kickoff,
      market: market.key,
      outcome: price.outcome,
      odds: price.odds,
    });
  }

  // A price that moved is only placed when the player has said to accept it.
  if (changes.length && body.acceptOddsChanges === false) {
    return NextResponse.json(
      {
        error:
          changes.length === 1
            ? `The price on ${changes[0].match} moved from ${changes[0].from.toFixed(2)} to ${changes[0].to.toFixed(2)}.`
            : `${changes.length} prices moved since you built this slip.`,
        oddsChanged: changes,
      },
      { status: 409 },
    );
  }

  // --- Build the lines this slip becomes ----------------------------------
  let lines: PricedLeg[][];

  if (mode === "single") {
    lines = priced.map((leg) => [leg]);
  } else if (mode === "system") {
    const size = Number(body.systemSize);
    if (!systemSizes(priced.length).includes(size)) {
      return NextResponse.json(
        { error: `A system on ${priced.length} selections must be between 2 and ${priced.length - 1}` },
        { status: 400 },
      );
    }
    lines = combinations(priced, size);
  } else {
    lines = [priced];
  }

  if (!lines.length) return NextResponse.json({ error: "Nothing to place" }, { status: 400 });
  if (lines.length > MAX_LINES) {
    return NextResponse.json(
      { error: `That system makes ${lines.length} lines, more than the ${MAX_LINES} allowed` },
      { status: 400 },
    );
  }

  const totalCost = Math.round(stake * lines.length * 100) / 100;

  // --- Debit the whole cost, then write the tickets ------------------------
  const { data: user } = await supabase
    .from("users")
    .select("id, balance, currency")
    .eq("id", userId)
    .maybeSingle();

  if (!user) return NextResponse.json({ error: "Sign in to place a bet" }, { status: 401 });

  const balance = Number(user.balance);
  if (balance < totalCost) {
    return NextResponse.json(
      { error: `That costs ${totalCost.toFixed(2)}. Top up to place it.` },
      { status: 402 },
    );
  }

  // Guarded on the balance we read, so two slips submitted at once cannot both
  // spend the same money.
  const { data: debited } = await supabase
    .from("users")
    .update({ balance: Math.round((balance - totalCost) * 100) / 100 })
    .eq("id", userId)
    .eq("balance", balance)
    .select("id")
    .maybeSingle();

  if (!debited) {
    return NextResponse.json({ error: "Your balance changed. Try again." }, { status: 409 });
  }

  const refund = async () => {
    const { data: current } = await supabase.from("users").select("balance").eq("id", userId).single();
    if (current) {
      await supabase
        .from("users")
        .update({ balance: Math.round((Number(current.balance) + totalCost) * 100) / 100 })
        .eq("id", userId);
    }
  };

  // Lines from one slip share a group code, so My Bets can show them together.
  const group = lines.length > 1 ? bookingCode() : null;

  const rows: TicketRow[] = lines.map((legs) => {
    const totalOdds = Math.min(
      MAX_ODDS,
      Math.round(legs.reduce((acc, l) => acc * l.odds, 1) * 1000) / 1000,
    );
    // Only a genuine multiple earns the accumulator bonus.
    const bonus =
      legs.length >= 2 ? bonusAmount(stake, totalOdds, legs.map((l) => l.odds)) : 0;

    return {
      code: ticketCode(),
      user_id: userId,
      stake,
      total_odds: totalOdds,
      potential_win: Math.round((stake * totalOdds + bonus) * 100) / 100,
      bonus,
      currency: user.currency,
      status: "pending",
      mode,
      group_code: group,
      legs,
    };
  });

  const { data: tickets, error: ticketErr } = await supabase
    .from("bets")
    .insert(rows.map((r) => toInsert(r)))
    .select("id, code, stake, total_odds, potential_win, bonus, currency, mode, group_code, created_at");

  if (ticketErr || !tickets?.length) {
    console.error("[bet] ticket write failed, refunding", userId, ticketErr);
    await refund();
    return NextResponse.json({ error: "Could not place your bet. Your stake was returned." }, { status: 500 });
  }

  // Match each written ticket back to the legs it was built from.
  const byCode = new Map(rows.map((r) => [r.code, r.legs]));

  const legRows = tickets.flatMap((ticket) =>
    (byCode.get(ticket.code) ?? []).map((p) => ({
      bet_id: ticket.id,
      match_id: p.matchId,
      home_team: p.home,
      away_team: p.away,
      league: p.league,
      sport: p.sport,
      kickoff: p.kickoff,
      market: p.market,
      outcome: p.outcome,
      odds: p.odds,
      result: "pending",
    })),
  );

  const { error: legErr } = await supabase.from("bet_selections").insert(legRows);

  if (legErr) {
    console.error("[bet] legs write failed, rolling back", group, legErr);
    await supabase.from("bets").delete().in(
      "id",
      tickets.map((t) => t.id),
    );
    await refund();
    return NextResponse.json({ error: "Could not place your bet. Your stake was returned." }, { status: 500 });
  }

  return NextResponse.json({
    mode,
    oddsChanged: changes,
    lines: tickets.length,
    totalCost,
    group,
    // The first ticket backs the receipt; the rest are the other lines.
    ticket: { ...tickets[0], selections: byCode.get(tickets[0].code) ?? [] },
    tickets,
    balance: Math.round((balance - totalCost) * 100) / 100,
  });
}
