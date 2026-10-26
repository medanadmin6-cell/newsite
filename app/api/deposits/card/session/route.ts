import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * What the checkout page needs to draw itself: the amount being paid and the
 * state the deposit is already in. It returns nothing about the card and
 * nothing about the player beyond the deposit they opened.
 */
export async function GET(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const reference = new URL(req.url).searchParams.get("reference");
  if (!reference) return NextResponse.json({ error: "Missing reference" }, { status: 400 });

  const { data: payment } = await supabase
    .from("payments")
    .select("reference, amount, currency, provider, status")
    .eq("reference", reference)
    .maybeSingle();

  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (payment.provider !== "flutterwave_card") {
    return NextResponse.json({ error: "That deposit is not a card payment" }, { status: 400 });
  }

  return NextResponse.json({
    reference: payment.reference,
    amount: Number(payment.amount),
    currency: payment.currency,
    status: payment.status,
  });
}
