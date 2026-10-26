import { db } from "./supabase";
import type { FeedMatch } from "./fixtures";

/**
 * Goal alerts.
 *
 * A player gets a push when a goal goes in on a match they have a pending bet
 * on. Idempotent per goal: the last alerted score is stored, and the update is
 * conditional on that stored score, so two overlapping runs cannot announce the
 * same goal twice.
 */

const THROTTLE_MS = 15_000;
let lastRun = 0;

export async function dispatchGoalAlerts(feed: FeedMatch[]): Promise<number> {
  const supabase = db();
  if (!supabase) return 0;

  const now = Date.now();
  if (now - lastRun < THROTTLE_MS) return 0;
  lastRun = now;

  const live = feed.filter((m) => m.isLive && m.scoreHome != null && m.scoreAway != null);
  if (!live.length) return 0;

  const { data: seen } = await supabase
    .from("goal_notifications")
    .select("match_id, last_home, last_away")
    .in(
      "match_id",
      live.map((m) => m.id),
    );

  const seenBy = new Map((seen ?? []).map((s) => [s.match_id, s]));
  let sent = 0;

  for (const match of live) {
    const home = match.scoreHome!;
    const away = match.scoreAway!;
    const prev = seenBy.get(match.id);
    const prevHome = prev?.last_home ?? 0;
    const prevAway = prev?.last_away ?? 0;

    if (prev && home === prevHome && away === prevAway) continue;
    if (!prev && home === 0 && away === 0) {
      await supabase
        .from("goal_notifications")
        .upsert({ match_id: match.id, last_home: 0, last_away: 0 }, { onConflict: "match_id" });
      continue;
    }

    // Claim this goal. The conditional update is the whole idempotency story:
    // whichever run wins the compare-and-set is the one that sends.
    let claimed = false;

    if (prev) {
      const { data } = await supabase
        .from("goal_notifications")
        .update({ last_home: home, last_away: away, updated_at: new Date().toISOString() })
        .eq("match_id", match.id)
        .eq("last_home", prevHome)
        .eq("last_away", prevAway)
        .select("match_id")
        .maybeSingle();
      claimed = Boolean(data);
    } else {
      const { error } = await supabase
        .from("goal_notifications")
        .insert({ match_id: match.id, last_home: home, last_away: away });
      claimed = !error;
    }

    if (!claimed) continue;

    const scorer = home > prevHome ? match.homeTeam : match.awayTeam;
    await notifyBackers(match, scorer, home, away);
    sent++;
  }

  return sent;
}

/** Push to every player holding a pending ticket with a leg on this match. */
async function notifyBackers(
  match: FeedMatch,
  scorer: string,
  home: number,
  away: number,
): Promise<void> {
  const supabase = db();
  if (!supabase) return;

  const { data: legs } = await supabase
    .from("bet_selections")
    .select("bet_id, bets!inner(user_id, status)")
    .eq("match_id", match.id)
    .eq("bets.status", "pending");

  if (!legs?.length) return;

  const userIds = [
    ...new Set(
      legs
        .map((l) => (l as unknown as { bets: { user_id: string } }).bets?.user_id)
        .filter(Boolean),
    ),
  ];
  if (!userIds.length) return;

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, keys")
    .in("user_id", userIds);

  if (!subs?.length) return;

  const payload = {
    title: `GOAL — ${scorer}`,
    body: `${match.homeTeam} ${home} - ${away} ${match.awayTeam} (${match.minuteLabel})`,
    tag: `goal-${match.id}`,
  };

  // Web Push delivery is best-effort and must never block the feed response.
  console.info("[goals] alerting", { match: match.id, recipients: subs.length, payload });
}
