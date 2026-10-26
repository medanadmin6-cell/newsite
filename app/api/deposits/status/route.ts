import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { adapterFor, settledAmount } from "@/lib/gateways";
import { applyDepositCredit } from "@/lib/money";
import type { Gateway } from "@/lib/countries";

export const dynamic = "force-dynamic";

/**
 * Poll a charge while the player waits on the approval prompt. A confirmed
 * charge credits immediately rather than waiting for the webhook, because the
 * player is sitting on the screen watching for it.
 */
export async function GET(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const reference = new URL(req.url).searchParams.get("reference");
  if (!reference) return NextResponse.json({ error: "Missing reference" }, { status: 400 });

  const { data: payment } = await supabase
    .from("payments")
    .select("reference, user_id, amount, currency, provider, status, metadata")
    .eq("reference", reference)
    .maybeSingle();

  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (payment.status === "confirmed" || payment.status === "resolved") {
    return NextResponse.json({ status: "confirmed" });
  }

  const outcome = await adapterFor(payment.provider as Gateway).status(
    reference,
    (payment.metadata ?? undefined) as Record<string, unknown> | undefined,
  );

  if (outcome.status === "confirmed") {
    // Credit what the rail says arrived. A player can open a GH₵500 deposit and
    // approve GH₵5 on the handset; that is a GH₵5 deposit.
    const result = await applyDepositCredit({
      userId: payment.user_id,
      amount: settledAmount(outcome, Number(payment.amount), payment.currency),
      currency: payment.currency,
      reference,
      provider: payment.provider,
    });
    return NextResponse.json({
      status: "confirmed",
      balance: result.balance,
      bonusPaid: result.bonusPaid ?? 0,
    });
  }

  if (outcome.status === "failed") {
    await supabase.from("payments").update({ status: "failed" }).eq("reference", reference);
    return NextResponse.json({ status: "failed" });
  }

  return NextResponse.json({ status: "pending" });
}
