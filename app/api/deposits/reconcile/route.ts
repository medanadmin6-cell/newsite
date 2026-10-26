import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { adapterFor, settledAmount } from "@/lib/gateways";
import { applyDepositCredit } from "@/lib/money";
import type { Gateway } from "@/lib/countries";

export const dynamic = "force-dynamic";

/**
 * Sweep up deposits that settled while the player was away.
 *
 * Hosted checkouts are unreliable in exactly one way: the player closes the tab
 * before the redirect fires. The account screen calls this on load, and because
 * credits are idempotent it is safe to call as often as it likes.
 */
export async function POST(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  let body: { userId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!body.userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Only look back a day: anything older is the operator's problem, not a
  // dropped redirect.
  const since = new Date(Date.now() - 86_400_000).toISOString();

  const { data: pending } = await supabase
    .from("payments")
    .select("reference, user_id, amount, currency, provider, metadata")
    .eq("user_id", body.userId)
    .eq("status", "pending")
    .gte("created_at", since)
    .limit(20);

  if (!pending?.length) return NextResponse.json({ credited: 0 });

  let credited = 0;

  for (const payment of pending) {
    const meta = (payment.metadata ?? {}) as Record<string, unknown> & { type?: string };
    if (meta.type !== "deposit") continue;
    // The manual rail never self-confirms; it waits for the operator.
    if (payment.provider === "manual") continue;

    const outcome = await adapterFor(payment.provider as Gateway).status(payment.reference, meta);

    // A definitive refusal is written down, exactly as the nightly sweep does.
    // Every adapter reports anything it does not recognise as pending, so this
    // only lands on a rail's own final word -- and it stops a dead prompt being
    // re-polled by every sweep after it, which matters now the shell sweeps
    // every couple of minutes rather than only on the account screen.
    if (outcome.status === "failed") {
      await supabase
        .from("payments")
        .update({ status: "failed", resolved_at: new Date().toISOString() })
        .eq("reference", payment.reference)
        .eq("status", "pending");
      continue;
    }

    if (outcome.status !== "confirmed") continue;

    const result = await applyDepositCredit({
      userId: payment.user_id,
      amount: settledAmount(outcome, Number(payment.amount), payment.currency),
      currency: payment.currency,
      reference: payment.reference,
      provider: payment.provider,
    });

    if (result.credited) credited++;
  }

  return NextResponse.json({ credited });
}
