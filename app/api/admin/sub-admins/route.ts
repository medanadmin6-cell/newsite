import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-guard";
import { startOfToday, totalPerCurrency } from "@/lib/money";

export const dynamic = "force-dynamic";

/** Approve partners, read their payout details, settle commission. */
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const { data: partners } = await supabase
    .from("sub_admins")
    .select("id, name, email, phone, referral_code, approved, balances, lifetime, payout_name, payout_network, payout_number, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  // Referred-player counts, so the operator can see who is actually working.
  const { data: counts } = await supabase.from("users").select("referred_by").not("referred_by", "is", null);
  const byPartner = new Map<string, number>();
  for (const row of counts ?? []) {
    byPartner.set(row.referred_by, (byPartner.get(row.referred_by) ?? 0) + 1);
  }

  // What each partner has earned today, so the operator can see who is working
  // now rather than only who has earned at some point. One query for the whole
  // table: a per-partner read would be 200 round trips to fill one column.
  const { data: todayRows } = await supabase
    .from("commissions")
    .select("sub_admin_id, amount, currency")
    .gte("created_at", startOfToday())
    .limit(5000);

  const todayByPartner = new Map<string, { amount: number; currency: string }[]>();
  for (const row of todayRows ?? []) {
    const list = todayByPartner.get(row.sub_admin_id) ?? [];
    list.push({ amount: Number(row.amount), currency: row.currency });
    todayByPartner.set(row.sub_admin_id, list);
  }

  return NextResponse.json({
    partners: (partners ?? []).map((p) => ({
      ...p,
      referredPlayers: byPartner.get(p.id) ?? 0,
      today: totalPerCurrency(todayByPartner.get(p.id)),
    })),
  });
}

export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const body = await req.json().catch(() => null);
  if (!body?.id || !body?.action) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  if (body.action === "approve" || body.action === "revoke") {
    await supabase.from("sub_admins").update({ approved: body.action === "approve" }).eq("id", body.id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "settle") {
    // Settling zeroes the currency's balance but leaves the lifetime total, so
    // the partner keeps a record of everything they have ever earned.
    const currency = String(body.currency ?? "");
    const { data: partner } = await supabase
      .from("sub_admins")
      .select("balances")
      .eq("id", body.id)
      .maybeSingle();

    if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

    const balances = { ...((partner.balances ?? {}) as Record<string, number>) };
    const settled = balances[currency] ?? 0;
    balances[currency] = 0;

    await supabase.from("sub_admins").update({ balances }).eq("id", body.id);
    console.info("[admin] commission settled", { partner: body.id, currency, settled });
    return NextResponse.json({ ok: true, settled });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
