import { db, missingColumn } from "./supabase";
import { matchClock, scoreFromTimeline } from "./clock";
import { fetchResults, attachCorners, type MatchResult } from "./results";
import { fetchEspnResults, isEspnId } from "./espn";
import { judge, CORNER_MARKETS } from "./judge";
import { roundMoney, stakeToWallet } from "./fx";

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
/** Tickets per page; also keeps each legs lookup's id list a safe length. */
const PAGE_SIZE = 200;
/** Up to 5,000 tickets per run, so one poll can never run unbounded. */
const MAX_PAGES = 25;
let lastRun = 0;

export interface SettleReport {
  skipped?: "throttled" | "no-db";
  ticketsChecked: number;
  won: number;
  lost: number;
  /** Tickets whose every leg was void, so the stake was returned. */
  voided?: number;
  stillPending: number;
}

type Leg = {
  id: string;
  bet_id: string;
  match_id: string;
  market: string;
  outcome: string;
  odds?: number | string | null;
  result: string;
  kickoff?: string | null;
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

  // Every pending ticket is visited, a page at a time. Walking by id (rather
  // than by offset) means a ticket that settles mid-run cannot shift the next
  // page and make another one get skipped. The page cap only bounds one run's
  // time; whatever is left is picked up by the next run.
  const total: SettleReport = { ticketsChecked: 0, won: 0, lost: 0, stillPending: 0 };
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    let query = supabase
      .from("bets")
      .select("id, user_id, stake, total_odds, potential_win, currency, status")
      .eq("status", "pending")
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);
    if (opts.userId) query = query.eq("user_id", opts.userId);
    if (after) query = query.gt("id", after);

    const { data, error } = await query;
    if (error) {
      console.error("[settle] could not load tickets", error);
      break;
    }
    const tickets = (data ?? []) as Ticket[];
    if (!tickets.length) break;

    const part = await settleBatch(tickets);
    total.ticketsChecked += part.ticketsChecked;
    total.won += part.won;
    total.lost += part.lost;
    if (part.voided) total.voided = (total.voided ?? 0) + part.voided;
    total.stillPending += part.stillPending;

    if (tickets.length < PAGE_SIZE) break;
    after = String(tickets[tickets.length - 1].id);
  }

  if (total.won || total.lost || total.voided) {
    console.info("[settle]", total);
  }
  return total;
}

type Ticket = {
  id: string;
  user_id: string;
  stake: number | string;
  potential_win: number | string;
  currency: string | null;
};

/** Settles one page of pending tickets. */
async function settleBatch(tickets: Ticket[]): Promise<SettleReport> {
  const supabase = db();
  if (!supabase) return { ticketsChecked: 0, won: 0, lost: 0, stillPending: 0 };

  // Kickoff is what finds a finished ESPN game on that day's scoreboard.
  // A database that has not added the column yet still settles; it just
  // cannot look those games up by date.
  const betIds = tickets.map((t) => t.id);
  const withKickoff = await supabase
    .from("bet_selections")
    .select("id, bet_id, match_id, market, outcome, odds, result, kickoff")
    .in("bet_id", betIds);
  let legs: Leg[] | null = withKickoff.data as Leg[] | null;
  let legsError = withKickoff.error;
  if (missingColumn(legsError, "kickoff")) {
    const without = await supabase
      .from("bet_selections")
      .select("id, bet_id, match_id, market, outcome, odds, result")
      .in("bet_id", betIds);
    legs = without.data as Leg[] | null;
    legsError = without.error;
  }
  if (legsError) {
    console.error("[settle] could not load legs", legsError);
    return { ticketsChecked: tickets.length, won: 0, lost: 0, stillPending: tickets.length };
  }

  const rows = (legs ?? []) as Leg[];
  if (!rows.length) {
    return { ticketsChecked: tickets.length, won: 0, lost: 0, stillPending: tickets.length };
  }

  // Resolve every distinct match once, not once per leg. The kickoff is what
  // lets a finished ESPN game be found on that day's scoreboard.
  const matchIds = [...new Set(rows.map((l) => l.match_id))];
  const kickoffs = new Map<string, string>();
  for (const leg of rows) {
    if (leg.kickoff && !kickoffs.has(leg.match_id)) kickoffs.set(leg.match_id, leg.kickoff);
  }
  const { results, voided } = await resolveResults(matchIds, kickoffs);

  // Corner counts are a second upstream call, so they are only fetched for the
  // matches that actually have a corners leg riding on them.
  const needCorners = new Set(
    rows.filter((l) => CORNER_MARKETS.has(l.market)).map((l) => l.match_id),
  );
  for (const id of needCorners) {
    const r = results.get(id);
    if (r && !id.startsWith("cm_")) {
      results.set(id, await attachCorners(id, r));
    }
  }

  const report: SettleReport = { ticketsChecked: tickets.length, won: 0, lost: 0, stillPending: 0 };
  const byTicket = new Map<string, Leg[]>();
  for (const l of rows) {
    const list = byTicket.get(l.bet_id) ?? [];
    list.push(l);
    byTicket.set(l.bet_id, list);
  }

  for (const ticket of tickets) {
    const ticketLegs = byTicket.get(ticket.id) ?? [];
    let anyLost = false;
    let allWon = ticketLegs.length > 0;
    // Legs that count at odds 1.00 because their match no longer exists.
    const voidLegs = new Set<string>();

    for (const leg of ticketLegs) {
      if (leg.result === "won") continue;
      if (leg.result === "void") {
        voidLegs.add(leg.id);
        continue;
      }
      if (leg.result === "lost") {
        anyLost = true;
        continue;
      }

      // The operator deleted this custom match, so it can never produce a
      // score. The usual bookmaker rule applies: the leg is void and the rest
      // of the ticket stands on its own.
      if (voided.has(leg.match_id)) {
        await supabase.from("bet_selections").update({ result: "void" }).eq("id", leg.id);
        voidLegs.add(leg.id);
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
      //
      // A void leg pays at 1.00: the stake rides on the legs that were judged,
      // and the accumulator bonus no longer applies. Every leg void means the
      // stake comes back and the ticket itself is void.
      const allVoid = voidLegs.size === ticketLegs.length;
      let payout = Number(ticket.potential_win);
      if (voidLegs.size) {
        const odds = ticketLegs
          .filter((l) => !voidLegs.has(l.id))
          .reduce((acc, l) => acc * (Number(l.odds) > 1 ? Number(l.odds) : 1), 1);
        payout = Math.min(payout, roundMoney(Number(ticket.stake) * odds));
      }
      const status = allVoid ? "void" : "won";
      const { data: transitioned } = await supabase
        .from("bets")
        .update({ status, settled_at: new Date().toISOString(), payout })
        .eq("id", ticket.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

      if (transitioned) {
        await creditWinnings(ticket.user_id, payout, String(ticket.currency ?? ""));
        if (allVoid) report.voided = (report.voided ?? 0) + 1;
        else report.won++;
      }
      continue;
    }

    report.stillPending++;
  }

  return report;
}

/**
 * Results for the matches these legs sit on.
 *
 * Operator-created fixtures are resolved from their own scripted timeline or a
 * hand-set result; upstream fixtures come from the real finished score. A match
 * that is absent from the map simply is not settleable yet.
 *
 * `voided` lists custom matches whose row is gone: the operator deleted them,
 * so they will never have a score and their legs are void.
 */
async function resolveResults(
  matchIds: string[],
  kickoffs: Map<string, string>,
): Promise<{ results: Resolved; voided: Set<string> }> {
  const voided = new Set<string>();
  const out = await resolveInto(matchIds, kickoffs, voided);
  return { results: out, voided };
}

async function resolveInto(
  matchIds: string[],
  kickoffs: Map<string, string>,
  voided: Set<string>,
): Promise<Resolved> {
  const supabase = db();
  const out: Resolved = new Map();
  if (!supabase) return out;

  // --- Operator-created fixtures ----------------------------------------
  const customIds = matchIds.filter((id) => id.startsWith("cm_")).map((id) => id.slice(3));

  if (customIds.length) {
    const { data: matches, error: matchesError } = await supabase
      .from("custom_matches")
      .select("id, kickoff, sport, goal_timeline, final_home, final_away, finished")
      .in("id", customIds);

    // Only a lookup that answered can say a match is gone. A failed query
    // must never void anything: it just leaves the legs pending.
    if (!matchesError && matches) {
      const present = new Set(matches.map((m) => String(m.id)));
      for (const id of customIds) if (!present.has(id)) voided.add(`cm_${id}`);
    }

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
  const apiIds = fetchable.filter((id) => !isEspnId(id));
  const espnIds = fetchable.filter((id) => isEspnId(id));
  const espnDates = new Map<string, string>();
  for (const id of espnIds) {
    const iso = kickoffs.get(id);
    if (iso) espnDates.set(id, iso);
  }
  const upstream = await fetchResults(apiIds);
  const espn = await fetchEspnResults(espnDates);
  for (const [id, score] of espn) {
    upstream.set(id, {
      home: score.home,
      away: score.away,
      htHome: null,
      htAway: null,
      cornersHome: null,
      cornersAway: null,
      finished: true,
    });
  }

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

async function creditWinnings(userId: string, payout: number, ticketCurrency: string): Promise<void> {
  const supabase = db();
  if (!supabase || !(payout > 0)) return;

  const { data: user } = await supabase
    .from("users")
    .select("balance, currency")
    .eq("id", userId)
    .single();
  if (!user) return;

  // A cedi ticket pays the dollar wallet the converted amount. The ticket
  // itself keeps the cedi figure the player staked.
  const credit = stakeToWallet(ticketCurrency, String(user.currency ?? "USD"), payout);
  if (!(credit > 0)) return;

  await supabase
    .from("users")
    .update({ balance: roundMoney(Number(user.balance) + credit) })
    .eq("id", userId);
}
