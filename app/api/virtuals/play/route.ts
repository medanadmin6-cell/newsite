import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { ticketCode } from "@/lib/codes";
import {
  drawFixture,
  findFixture,
  LEAGUE_NAMES,
  outcomeWins,
  readBoard,
  signedOdds,
  type DrawnMatch,
} from "@/lib/virtuals";

export const dynamic = "force-dynamic";

const MIN_STAKE = 1;
const MAX_STAKE = 500;
const MAX_PICKS = 20;

interface IncomingPick {
  fixtureId?: string;
  market?: string;
  outcome?: string;
  stake?: number;
}

/**
 * Kick off a signed round.
 *
 * Every pick is its own single, with its own stake. One loser does not void
 * the others. The score is drawn from the signed lambdas with crypto
 * randomness. The stake is not an input to that draw.
 */
export async function POST(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  let body: {
    userId?: string;
    token?: string;
    board?: unknown;
    picks?: IncomingPick[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const picks = body.picks ?? [];
  if (!picks.length) return NextResponse.json({ error: "Your slip is empty" }, { status: 400 });
  if (picks.length > MAX_PICKS) {
    return NextResponse.json({ error: `A slip can hold at most ${MAX_PICKS} picks` }, { status: 400 });
  }

  const checked = readBoard(body.board, body.token ?? "");
  if (!checked.ok) {
    const error = checked.reason === "expired" ? "This round expired. Take the next one." : "This round is not valid. Take the next one.";
    return NextResponse.json({ error }, { status: 400 });
  }
  const board = checked.board;

  const seen = new Set<string>();
  const priced: {
    fixtureId: string;
    market: string;
    outcome: string;
    odds: number;
    home: string;
    away: string;
    league: keyof typeof LEAGUE_NAMES;
    stake: number;
  }[] = [];

  for (const pick of picks) {
    if (!pick || typeof pick.fixtureId !== "string" || typeof pick.market !== "string" || typeof pick.outcome !== "string") {
      return NextResponse.json({ error: "That pick is not on this round" }, { status: 400 });
    }
    const key = `${pick.fixtureId}|${pick.market}|${pick.outcome}`;
    if (seen.has(key)) return NextResponse.json({ error: "That pick is already on the slip" }, { status: 400 });
    seen.add(key);
    const found = findFixture(board, pick.fixtureId);
    const odds = found ? signedOdds(found.fixture, pick.market, pick.outcome) : null;
    const stake = Math.round(Number(pick.stake) * 100) / 100;
    if (!Number.isFinite(stake) || stake < MIN_STAKE || stake > MAX_STAKE) {
      return NextResponse.json({ error: `Each single needs a stake between ${MIN_STAKE} and ${MAX_STAKE}` }, { status: 400 });
    }
    if (!found || odds === null) {
      return NextResponse.json({ error: "That pick is not on this round" }, { status: 400 });
    }
    priced.push({
      fixtureId: found.fixture.id,
      market: pick.market,
      outcome: pick.outcome,
      odds,
      home: found.fixture.home.code,
      away: found.fixture.away.code,
      league: found.league,
      stake,
    });
  }

  if (!body.userId) return NextResponse.json({ error: "Sign in to play" }, { status: 401 });

  const { data: user } = await supabase
    .from("users")
    .select("id, balance, currency")
    .eq("id", body.userId)
    .maybeSingle();
  if (!user) return NextResponse.json({ error: "Sign in to play" }, { status: 401 });

  const totalDebit = Math.round(priced.reduce((sum, pick) => sum + pick.stake, 0) * 100) / 100;
  const held = Number(user.balance);
  if (held < totalDebit) return NextResponse.json({ error: "Not enough balance" }, { status: 402 });

  const afterStake = Math.round((held - totalDebit) * 100) / 100;
  const { data: debited } = await supabase
    .from("users")
    .update({ balance: afterStake })
    .eq("id", user.id)
    .eq("balance", held)
    .select("id")
    .maybeSingle();
  if (!debited) return NextResponse.json({ error: "Your balance changed. Try again." }, { status: 409 });

  const restore = async () => {
    await supabase.from("users").update({ balance: held }).eq("id", user.id);
  };

  const drawn = new Map<string, DrawnMatch>();
  for (const group of board.leagues) {
    for (const fixture of group.fixtures) {
      drawn.set(fixture.id, drawFixture(fixture.lambdaHome, fixture.lambdaAway));
    }
  }

  const settled = priced.map((pick) => {
    const score = drawn.get(pick.fixtureId)!;
    const won = outcomeWins(pick.market, pick.outcome, score);
    const payout = won ? Math.round(pick.stake * pick.odds * 100) / 100 : 0;
    return { ...pick, won, payout, score };
  });
  const totalPayout = Math.round(settled.reduce((sum, pick) => sum + pick.payout, 0) * 100) / 100;
  const finalBalance = Math.round((afterStake + totalPayout) * 100) / 100;

  if (totalPayout > 0) {
    const { error } = await supabase.from("users").update({ balance: finalBalance }).eq("id", user.id);
    if (error) {
      console.error("[virtuals] credit failed, restoring balance", error);
      await restore();
      return NextResponse.json({ error: "Could not pay the win. Your stake was returned." }, { status: 500 });
    }
  }

  const rows = settled.map((pick) => ({
    code: ticketCode(),
    user_id: user.id,
    stake: pick.stake,
    total_odds: pick.odds,
    potential_win: Math.round(pick.stake * pick.odds * 100) / 100,
    currency: user.currency,
    status: pick.won ? "won" : "lost",
    payout: pick.payout,
    mode: "single",
    settled_at: new Date().toISOString(),
    pick,
  }));

  const { data: tickets, error: ticketErr } = await supabase
    .from("bets")
    .insert(rows.map(({ pick, ...row }) => row))
    .select("id, code");

  if (ticketErr || !tickets?.length || tickets.length !== rows.length) {
    console.error("[virtuals] ticket failed, restoring balance", ticketErr);
    if (tickets?.length) {
      await supabase.from("bets").delete().in(
        "id",
        tickets.map((ticket) => ticket.id),
      );
    }
    await restore();
    return NextResponse.json({ error: "Could not save the match. Your stake was returned." }, { status: 500 });
  }

  const byCode = new Map(rows.map((row) => [row.code, row.pick]));
  const legRows = tickets.map((ticket) => {
    const pick = byCode.get(ticket.code)!;
    return {
      bet_id: ticket.id,
      match_id: `virtual-${pick.fixtureId}`,
      home_team: pick.home,
      away_team: pick.away,
      league: LEAGUE_NAMES[pick.league],
      sport: "virtual",
      kickoff: new Date().toISOString(),
      market: pick.market,
      outcome: pick.outcome,
      odds: pick.odds,
      result: pick.won ? "won" : "lost",
      final_home: pick.score.homeGoals,
      final_away: pick.score.awayGoals,
    };
  });

  const { error: legErr } = await supabase.from("bet_selections").insert(legRows);
  if (legErr) {
    console.error("[virtuals] leg failed, restoring balance", legErr);
    await supabase.from("bets").delete().in(
      "id",
      tickets.map((ticket) => ticket.id),
    );
    await restore();
    return NextResponse.json({ error: "Could not save the match. Your stake was returned." }, { status: 500 });
  }

  const fixtures = board.leagues.flatMap((group) =>
    group.fixtures.map((fixture) => {
      const score = drawn.get(fixture.id)!;
      return {
        id: fixture.id,
        league: group.league,
        home: fixture.home.code,
        away: fixture.away.code,
        homeGoals: score.homeGoals,
        awayGoals: score.awayGoals,
        events: score.events,
      };
    }),
  );

  return NextResponse.json({
    balance: finalBalance,
    currency: user.currency,
    stake: totalDebit,
    totalDebit,
    payout: totalPayout,
    won: settled.filter((pick) => pick.won).length,
    lost: settled.filter((pick) => !pick.won).length,
    tickets: tickets.map((ticket) => {
      const pick = byCode.get(ticket.code)!;
      return {
        code: ticket.code,
        won: pick.won,
        odds: pick.odds,
        stake: pick.stake,
        payout: pick.payout,
        market: pick.market,
        outcome: pick.outcome,
        home: pick.home,
        away: pick.away,
        fixtureId: pick.fixtureId,
      };
    }),
    fixtures,
  });
}
