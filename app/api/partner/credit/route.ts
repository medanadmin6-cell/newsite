import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { currentPartner, partnerCreditLimits } from "@/lib/partner";
import { paymentReference } from "@/lib/codes";

/**
 * A partner crediting their own betting wallet.
 *
 * This is an agent float, not a deposit and not commission:
 *
 *   - Commission is untouched. It stays on the partner side and is settled by
 *     the operator, exactly as before.
 *   - It does not run applyDepositCredit, so it pays no welcome bonus, earns no
 *     commission, and does not advance the withdrawal gate. A partner who could
 *     self-credit past that gate would bypass it entirely.
 *
 * Every credit writes a ledger row and shows in the operator's payments screen,
 * because this is the one place in the platform where money appears without a
 * payment rail behind it. The operator reconciles against what the agent has
 * actually paid in.
 */

export async function POST(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const partner = await currentPartner();
  if (!partner) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  if (!partner.approved) {
    return NextResponse.json({ error: "Your partner account is waiting for approval." }, { status: 403 });
  }
  if (!partner.user_id) {
    return NextResponse.json({ error: "Open your betting account first." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const amount = Number(body?.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Enter an amount" }, { status: 400 });
  }

  const { perCredit, perDay } = partnerCreditLimits();
  if (amount > perCredit) {
    return NextResponse.json({ error: `The most you can credit at once is ${perCredit}` }, { status: 400 });
  }

  const { data: player } = await supabase
    .from("users")
    .select("id, balance, currency")
    .eq("id", partner.user_id)
    .maybeSingle();

  if (!player) return NextResponse.json({ error: "Betting account not found" }, { status: 404 });

  // --- Rolling 24-hour cap ------------------------------------------------
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data: recent } = await supabase
    .from("payments")
    .select("amount")
    .eq("user_id", player.id)
    .eq("provider", "partner")
    .gte("created_at", since);

  const used = (recent ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
  if (used + amount > perDay) {
    return NextResponse.json(
      { error: `That would pass your daily limit of ${perDay}. You have used ${used.toFixed(2)} today.` },
      { status: 400 },
    );
  }

  // --- Ledger first -------------------------------------------------------
  // Written before the money moves: an unmatched ledger row is a reconciliation
  // question, whereas a credit with no ledger row is money nobody can account for.
  const reference = paymentReference("PSC");

  const { error: ledgerErr } = await supabase.from("payments").insert({
    reference,
    user_id: player.id,
    amount,
    currency: player.currency,
    provider: "partner",
    status: "pending",
    metadata: {
      type: "partner_credit",
      sub_admin_id: partner.id,
      partner_name: partner.name,
      partner_code: partner.referral_code,
      note: "Partner credited their own betting wallet",
    },
  });

  if (ledgerErr) {
    console.error("[partner] could not record the credit", partner.id, ledgerErr);
    return NextResponse.json({ error: "Could not record the credit" }, { status: 500 });
  }

  // --- Then the wallet ----------------------------------------------------
  const balance = Number(player.balance);
  const next = Math.round((balance + amount) * 100) / 100;

  const { data: credited } = await supabase
    .from("users")
    .update({ balance: next })
    .eq("id", player.id)
    .eq("balance", balance)
    .select("id")
    .maybeSingle();

  if (!credited) {
    // Nothing moved, so retire the ledger row rather than leave a phantom credit.
    await supabase.from("payments").update({ status: "failed" }).eq("reference", reference);
    return NextResponse.json({ error: "Your balance changed. Try again." }, { status: 409 });
  }

  await supabase
    .from("payments")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("reference", reference);

  console.info("[partner] self credit", {
    partner: partner.id,
    code: partner.referral_code,
    amount,
    currency: player.currency,
    reference,
  });

  return NextResponse.json({
    ok: true,
    reference,
    balance: next,
    usedToday: Math.round((used + amount) * 100) / 100,
    dailyLimit: perDay,
  });
}
