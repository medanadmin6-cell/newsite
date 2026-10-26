import { db } from "./supabase";
import { matchClock, scoreFromTimeline } from "./clock";
import { fetchResults, attachCorners, type MatchResult } from "./results";
import { judge, CORNER_MARKETS } from "./judge";

/**
 * Automatic settlement.
 *
 * Called from four places, all sharing this one function and all safe to run
 * concurrently: the fixture feed, a player opening My Bets, the operator
 * opening the admin bets list, and a daily cron as a backstop for a site with
 * no traffic.
 *
 * Legs are judged off the real finished result — full-time score, half-time
 * score, and corner counts where a corners market needs them. Around fifty
 * market families settle automatically; the rest, and anything the data cannot
 * decide, stay pending for the operator.
 *
 * Nothing is ever guessed. A judge returns null whenever it is unsure, and a
 * null leaves the leg pending — because settling wrongly moves real money.
 */

const THROTTLE_MS = 25_000;
let lastRun = 0;

export interface SettleReport {
  skipped?: "throttled" | "no-db";
  ticketsChecked: number;
  won: number;
  lost: number;
  stillPending: number;
}

type Leg = {
  id: string;
  bet_id: string;
  match_id: string;
  market: string;
  outcome: string;
  result: string;
};

/** A judged leg needs the market key as well as the outcome. */
type Resolved = Map<string, MatchResult>;

export async function settleBets(opts: { userId?: string; force?: boolean } = {}): Promise<SettleReport> {
  const supabase = db();
  if (!supabase) return { skipped: "no-db", ticketsChecked: 0, won: 0, lost: 0, stillPending: 0 };

  const now = Date.now();
  if (!opts.force && !opts.userId && now - lastRun < THROTTLE_MS) {
    return { skipped: "throttled", ticketsChecked: 0, won: 0, lost: 0, stillPending: 0 };
  }
  lastRun = now;

  let query = supabase
    .from("bets")
    .select("id, user_id, stake, total_odds, potential_win, currency, status")
    .eq("status", "pending")
    .limit(200);

  if (opts.userId) query = query.eq("user_id", opts.userId);

  const { data: tickets, error } = await query;
  if (error || !tickets?.length) {
    return { ticketsChecked: 0, won: 0, lost: 0, stillPending: 0 };
  }

  const { data: legs } = await supabase
    .from("bet_selections")
    .select("id, bet_id, match_id, market, outcome, result")
    .in(
      "bet_id",
      tickets.map((t) => t.id),
    );

  if (!legs?.length) {
    return { ticketsChecked: tickets.length, won: 0, lost: 0, stillPending: tickets.length };
  }

  // Resolve every distinct match once, not once per leg.
  const matchIds = [...new Set(legs.map((l) => l.match_id))];
  const results = await resolveResults(matchIds);

  // Corner counts are a second upstream call, so they are only fetched for the
  // matches that actually have a corners leg riding on them.
  const needCorners = new Set(
    (legs as Leg[]).filter((l) => CORNER_MARKETS.has(l.market)).map((l) => l.match_id),
  );
  for (const id of needCorners) {
    const r = results.get(id);
    if (r && !id.startsWith("cm_")) {
      results.set(id, await attachCorners(id, r));
    }
  }

  const report: SettleReport = { ticketsChecked: tickets.length, won: 0, lost: 0, stillPending: 0 };
  const byTicket = new Map<string, Leg[]>();
  for (const l of legs as Leg[]) {
    const list = byTicket.get(l.bet_id) ?? [];
    list.push(l);
    byTicket.set(l.bet_id, list);
  }

  for (const ticket of tickets) {
    const ticketLegs = byTicket.get(ticket.id) ?? [];
    let anyLost = false;
    let allWon = ticketLegs.length > 0;

    for (const leg of ticketLegs) {
      if (leg.result === "won") continue;
      if (leg.result === "lost") {
        anyLost = true;
        continue;
      }

      const result = results.get(leg.match_id) ?? null;
      const judged = result ? judge(leg.market, leg.outcome, result) : null;

      if (judged === null) {
        // Unjudgeable market, or no final score yet. Leave it pending.
        allWon = false;
        continue;
      }

      // Store the final score the leg was judged on, so a settled ticket can
      // show the player how the match finished rather than a bare colour.
      await supabase
        .from("bet_selections")
        .update({
          result: judged ? "won" : "lost",
          final_home: result!.home,
          final_away: result!.away,
        })
        .eq("id", leg.id);

      if (judged) continue;
      anyLost = true;
    }

    if (anyLost) {
      // The stake is already gone; nothing is credited.
      const { data: transitioned } = await supabase
        .from("bets")
        .update({ status: "lost", settled_at: new Date().toISOString(), payout: 0 })
        .eq("id", ticket.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (transitioned) report.lost++;
      continue;
    }

    if (allWon) {
      // The guarded update is what makes double-crediting impossible: only the
      // run that actually transitions the ticket out of pending pays out.
      const payout = Number(ticket.potential_win);
      const { data: transitioned } = await supabase
        .from("bets")
        .update({ status: "won", settled_at: new Date().toISOString(), payout })
        .eq("id", ticket.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

      if (transitioned) {
        await creditWinnings(ticket.user_id, payout);
        report.won++;
      }
      continue;
    }

    report.stillPending++;
  }

  if (report.won || report.lost) {
    console.info("[settle]", report);
  }
  return report;
}

/**
 * Results for the matches these legs sit on.
 *
 * Operator-created fixtures are resolved from their own scripted timeline or a
 * hand-set result; upstream fixtures come from the real finished score. A match
 * that is absent from the map simply is not settleable yet.
 */
async function resolveResults(matchIds: string[]): Promise<Resolved> {
  const supabase = db();
  const out: Resolved = new Map();
  if (!supabase) return out;

  // --- Operator-created fixtures ----------------------------------------
  const customIds = matchIds.filter((id) => id.startsWith("cm_")).map((id) => id.slice(3));

  if (customIds.length) {
    const { data: matches } = await supabase
      .from("custom_matches")
      .select("id, kickoff, sport, goal_timeline, final_home, final_away, finished")
      .in("id", customIds);

    for (const m of matches ?? []) {
      // An operator "Set result" is authoritative and ends the argument.
      if (m.finished && m.final_home !== null && m.final_away !== null) {
        out.set(`cm_${m.id}`, {
          home: Number(m.final_home),
          away: Number(m.final_away),
          htHome: null,
          htAway: null,
          cornersHome: null,
          cornersAway: null,
          finished: true,
        });
        continue;
      }

      // Otherwise the clock decides when the match is over, and the scripted
      // timeline gives the score it ended on.
      const clock = matchClock(m.kickoff, m.sport ?? "football");
      if (!clock.isOver) continue;

      const timeline = (m.goal_timeline ?? []) as { minute: number; team: "home" | "away" }[];
      const full = scoreFromTimeline(timeline, clock);
      const firstHalf = timeline.filter((g) => g.minute <= 45);

      out.set(`cm_${m.id}`, {
        home: full.home,
        away: full.away,
        // A scripted timeline knows exactly when each goal landed, so the
        // half-time score is free and the half markets settle too.
        htHome: firstHalf.filter((g) => g.team === "home").length,
        htAway: firstHalf.filter((g) => g.team === "away").length,
        cornersHome: null,
        cornersAway: null,
        finished: true,
      });
    }
  }

  // --- Upstream fixtures -------------------------------------------------
  const upstreamIds = matchIds.filter((id) => !id.startsWith("cm_"));
  if (!upstreamIds.length) return out;

  // An operator correction wins over the feed, and a postponement blocks
  // settlement outright.
  const { data: overrides } = await supabase
    .from("match_overrides")
    .select("match_id, score_home, score_away, postponed")
    .in("match_id", upstreamIds);

  const blocked = new Set<string>();
  const corrected = new Map<string, { home: number; away: number }>();

  for (const o of overrides ?? []) {
    if (o.postponed) {
      blocked.add(o.match_id);
      continue;
    }
    if (o.score_home !== null && o.score_away !== null) {
      corrected.set(o.match_id, { home: Number(o.score_home), away: Number(o.score_away) });
    }
  }

  const fetchable = upstreamIds.filter((id) => !blocked.has(id));
  const upstream = await fetchResults(fetchable);

  for (const id of fetchable) {
    const feed = upstream.get(id);
    const fix = corrected.get(id);

    if (fix) {
      // Keep the feed's half-time and corner detail where we have it, but let
      // the operator's score stand as full time.
      out.set(id, {
        home: fix.home,
        away: fix.away,
        htHome: feed?.htHome ?? null,
        htAway: feed?.htAway ?? null,
        cornersHome: feed?.cornersHome ?? null,
        cornersAway: feed?.cornersAway ?? null,
        finished: true,
      });
      continue;
    }

    if (feed) out.set(id, feed);
  }

  return out;
}

async function creditWinnings(userId: string, payout: number): Promise<void> {
  const supabase = db();
  if (!supabase || !(payout > 0)) return;

  const { data: user } = await supabase.from("users").select("balance").eq("id", userId).single();
  if (!user) return;

  await supabase
    .from("users")
    .update({ balance: Number(user.balance) + payout })
    .eq("id", userId);
}
