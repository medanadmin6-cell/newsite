import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { adapterFor, settledAmount } from "@/lib/gateways";
import { applyDepositCredit } from "@/lib/money";
import type { Gateway } from "@/lib/countries";

export const dynamic = "force-dynamic";

/**
 * Resolve deposits nobody came back for.
 *
 * /api/deposits/reconcile does this for one player, and only when that player
 * opens their account screen. A player whose payment fails and who never
 * returns leaves the row pending for good — which is why a deposit that was
 * refused by the rail hours ago can still be sitting in the operator's console
 * as though it were in flight.
 *
 * This is the same sweep across every player. Crediting is idempotent, so a
 * run that overlaps the account screen's own call cannot pay twice.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
  }

  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  // A day back, matching the per-player sweep. Older than that is the
  // operator's to reconcile by hand, not a dropped redirect.
  const since = new Date(Date.now() - 86_400_000).toISOString();

  const { data: pending } = await supabase
    .from("payments")
    .select("reference, user_id, amount, currency, provider, metadata")
    .eq("status", "pending")
    .gte("created_at", since)
    .limit(500);

  let credited = 0;
  let failed = 0;
  let stillPending = 0;

  for (const payment of pending ?? []) {
    const meta = (payment.metadata ?? {}) as Record<string, unknown> & { type?: string };
    if (meta.type !== "deposit") continue;

    let outcome;
    try {
      outcome = await adapterFor(payment.provider as Gateway).status(payment.reference, meta);
    } catch (err) {
      // One rail being down must not stop the sweep reaching the others.
      console.error("[cron/reconcile] status failed", payment.reference, err);
      continue;
    }

    if (outcome.status === "confirmed") {
      const result = await applyDepositCredit({
        userId: payment.user_id,
        amount: settledAmount(outcome, Number(payment.amount), payment.currency),
        currency: payment.currency,
        reference: payment.reference,
        provider: payment.provider,
      });
      if (result.credited) credited++;
      continue;
    }

    // A rail that says failed has said so definitively — every adapter reports
    // anything it does not recognise as pending rather than failure. Writing it
    // down stops a refused payment sitting in the console looking live.
    if (outcome.status === "failed") {
      await supabase
        .from("payments")
        .update({ status: "failed", resolved_at: new Date().toISOString() })
        .eq("reference", payment.reference)
        .eq("status", "pending");
      failed++;
      continue;
    }

    stillPending++;
  }

  console.info("[cron/reconcile] swept", { credited, failed, stillPending });
  return NextResponse.json({ ok: true, credited, failed, stillPending });
}
