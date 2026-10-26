import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

/** The full ledger of deposits and withdrawals across every rail. */
export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const status = url.searchParams.get("status");

  let query = supabase
    .from("payments")
    .select("reference, amount, currency, provider, status, metadata, created_at, resolved_at, users!inner(id, name, phone)")
    .order("created_at", { ascending: false })
    .limit(300);

  if (status && status !== "all") query = query.eq("status", status);
  if (type && type !== "all") query = query.eq("metadata->>type", type);

  const { data } = await query;
  return NextResponse.json({ payments: data ?? [] });
}

/**
 * Mark a withdrawal row resolved once the operator has paid it out by hand,
 * or failed to return the money to the player.
 */
export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const body = await req.json().catch(() => null);
  if (!body?.reference || !body?.status) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { data: row } = await supabase
    .from("payments")
    .select("user_id, amount, status, metadata")
    .eq("reference", body.reference)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const meta = (row.metadata ?? {}) as Record<string, unknown>;

  // Turning a withdrawal down gives the money back -- but only when it was
  // taken in the first place. Rows written before withdrawals began deducting
  // carry no `debited` flag, and refunding one would hand a player money that
  // never left their balance. The guard on the current status keeps a second
  // press of the button from paying twice.
  const refundable =
    meta.type === "withdrawal" &&
    meta.debited === true &&
    row.status === "pending" &&
    (body.status === "failed" || body.status === "cancelled");

  if (refundable) {
    const { data: player } = await supabase
      .from("users")
      .select("balance, total_withdrawn")
      .eq("id", row.user_id)
      .maybeSingle();

    if (player) {
      await supabase
        .from("users")
        .update({ balance: Number(player.balance) + Number(row.amount) })
        .eq("id", row.user_id);
      console.info("[admin] withdrawal refused, balance returned", {
        reference: body.reference,
        userId: row.user_id,
        amount: row.amount,
      });
    }
  }

  await supabase
    .from("payments")
    .update({ status: body.status, resolved_at: new Date().toISOString() })
    .eq("reference", body.reference);

  return NextResponse.json({ ok: true, refunded: refundable });
}
