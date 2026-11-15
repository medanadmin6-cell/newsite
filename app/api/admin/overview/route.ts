import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-guard";
import { startOfToday, totalPerCurrency } from "@/lib/money";
import { matchClock } from "@/lib/clock";

export const dynamic = "force-dynamic";

const round2 = (n: number) => Math.round(n * 100) / 100;

function add(bucket: Record<string, number>, currency: string, amount: number) {
  const code = currency || "GHS";
  bucket[code] = round2((bucket[code] ?? 0) + Number(amount));
}

/**
 * Every matching row, a page at a time. A single capped select quietly
 * undercounts once the book outgrows the cap, so the totals were wrong on
 * exactly the days they mattered most. Stops at 20,000 rows.
 */
async function pages<T>(load: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data } = await load(from, from + 999);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

/** Platform totals for the overview page, broken out by currency. */
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const today = startOfToday();

  type Pay = { amount: number; currency: string; status: string; metadata: { type?: string } | null; resolved_at: string | null };
  type Open = { stake: number; potential_win: number; currency: string };
  type Staked = { stake: number; currency: string };

  const [
    payments,
    { count: players },
    { count: depositors },
    openBets,
    stakedToday,
    { count: pendingDeposits },
    { data: commissionRows },
    { data: partners },
    { data: customMatches },
  ] = await Promise.all([
    pages<Pay>((from, to) =>
      supabase.from("payments").select("amount, currency, status, metadata, resolved_at").order("id").range(from, to),
    ),
    supabase.from("users").select("id", { count: "exact", head: true }),
    supabase.from("users").select("id", { count: "exact", head: true }).gt("total_deposited", 0),
    pages<Open>((from, to) =>
      supabase.from("bets").select("stake, potential_win, currency").eq("status", "pending").order("id").range(from, to),
    ),
    pages<Staked>((from, to) =>
      supabase.from("bets").select("stake, currency").gte("created_at", today).order("id").range(from, to),
    ),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "pending").eq("provider", "manual"),
    // Commission paid out to every partner today. This is money already
    // moved to partner balances, so it is a cost of today's deposits rather
    // than a pending obligation.
    supabase.from("commissions").select("amount, currency, sub_admin_id").gte("created_at", today).limit(5000),
    // What partners are owed right now, and what they have earned in all.
    supabase.from("sub_admins").select("balances, lifetime").limit(2000),
    supabase.from("custom_matches").select("kickoff, sport, is_live, finished").eq("finished", false).limit(2000),
  ]);

  const deposits: Record<string, number> = {};
  const withdrawals: Record<string, number> = {};
  const depositsToday: Record<string, number> = {};
  let depositsTodayCount = 0;

  for (const p of payments) {
    const settled = p.status === "confirmed" || p.status === "resolved";
    if (!settled) continue;
    if ((p.metadata ?? {}).type === "withdrawal") {
      add(withdrawals, p.currency, p.amount);
      continue;
    }
    add(deposits, p.currency, p.amount);
    if (p.resolved_at && p.resolved_at >= today) {
      add(depositsToday, p.currency, p.amount);
      depositsTodayCount++;
    }
  }

  const liability: Record<string, number> = {};
  let openStake = 0;
  for (const b of openBets) {
    add(liability, b.currency, b.potential_win);
    openStake += Number(b.stake);
  }

  const staked: Record<string, number> = {};
  for (const b of stakedToday) add(staked, b.currency, b.stake);

  // Owed is what sits in partner balances; settled is what they earned and
  // have already been paid out.
  const pendingCommission: Record<string, number> = {};
  const earned: Record<string, number> = {};
  for (const partner of partners ?? []) {
    for (const [c, v] of Object.entries((partner.balances ?? {}) as Record<string, number>)) add(pendingCommission, c, v);
    for (const [c, v] of Object.entries((partner.lifetime ?? {}) as Record<string, number>)) add(earned, c, v);
  }
  const settledCommission: Record<string, number> = {};
  for (const c of new Set([...Object.keys(earned), ...Object.keys(pendingCommission)])) {
    settledCommission[c] = round2(Math.max(0, (earned[c] ?? 0) - (pendingCommission[c] ?? 0)));
  }

  // Live is read off the kickoff clock, the same as the board players see,
  // not only the stored flag the clock never writes back.
  const running = (customMatches ?? []).filter((m) => !matchClock(m.kickoff, m.sport ?? "football").isOver);
  const liveMatches = running.filter((m) => m.is_live || matchClock(m.kickoff, m.sport ?? "football").isLive).length;

  const partnersPaidToday = new Set((commissionRows ?? []).map((c) => c.sub_admin_id)).size;

  return NextResponse.json({
    deposits,
    withdrawals,
    depositsToday,
    depositsTodayCount,
    stakedToday: staked,
    stakedTodayCount: stakedToday.length,
    commissionToday: totalPerCurrency(commissionRows),
    commissionCountToday: commissionRows?.length ?? 0,
    partnersPaidToday,
    pendingCommission,
    settledCommission,
    players: players ?? 0,
    depositors: depositors ?? 0,
    openTickets: openBets.length,
    openStake: round2(openStake),
    liability,
    pendingDeposits: pendingDeposits ?? 0,
    customMatches: running.length,
    liveMatches,
  });
}
