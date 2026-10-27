import { NextResponse } from "next/server";
import { asRow, db, missingColumn } from "@/lib/supabase";
import { getCountry } from "@/lib/countries";
import { checkWithdrawalGate, type GateSubject } from "@/lib/withdrawals";

interface WithdrawUser extends GateSubject {
  id: string;
  phone: string;
  email: string | null;
  total_withdrawn: number | string;
}
import { linkedSubAdmin } from "@/lib/partner";
import { paymentReference } from "@/lib/codes";
import { sendSms, withdrawalRequestedSms } from "@/lib/sms";
import { requireAdmin } from "@/lib/admin-guard";

/**
 * Request a withdrawal.
 *
 * Three gates in order, and the player only sees the first one they fail. The
 * rule itself lives in lib/withdrawals so the withdraw sheet, this endpoint and
 * the admin players list can never drift apart.
 */
export async function POST(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  let body: { userId?: string; amount?: number; payoutNumber?: string; payoutBank?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!body.userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const columns =
    "id, phone, email, country_code, currency, balance, total_deposited, total_withdrawn, qualifying_deposits, verification_topup, withdrawal_approved, payout_number, payout_bank";
  let { data, error: userErr } = await supabase
    .from("users")
    .select(columns)
    .eq("id", body.userId)
    .maybeSingle();
  let user = asRow<WithdrawUser>(data);
  if (missingColumn(userErr, "verification_topup")) {
    const again = await supabase
      .from("users")
      .select(columns.replace(", verification_topup", ""))
      .eq("id", body.userId)
      .maybeSingle();
    const row = asRow<Omit<WithdrawUser, "verification_topup">>(again.data);
    user = row ? { ...row, verification_topup: false } : null;
  }

  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const [subAdmin, isAdmin] = await Promise.all([linkedSubAdmin(user), requireAdmin()]);

  // Approval is what makes the exemption safe. Anyone can register as a
  // partner and link a betting account, so exempting every linked sub-admin
  // let an unapproved one skip both the deposit verification and the
  // operator's own sign-off — the two controls on money leaving the platform.
  // An unapproved partner is treated as an ordinary player here.
  //
  // The operator's own session is the same kind of account: their player row
  // is usually not withdrawal_approved, and leaving them on that gate recorded
  // the request as "processing" with the banner forced off. They never saw it.
  const exempt = Boolean(subAdmin?.approved) || isAdmin;
  // The phone banner and the text are for the operator and an approved
  // sub-admin. A player never gets either one, including after the
  // verification deposits and the extra verification payment.

  // A linked sub-admin, and the operator, withdraw without the deposit
  // verification. Operator approval is not a second lock on those accounts.
  //
  // Every other player goes through the whole gate — payout details, the
  // deposit verification, then operator approval. They are not refused for
  // being an ordinary player; they are told which gate they are on.
  const gate = checkWithdrawalGate(
    exempt ? { ...user, withdrawal_approved: true } : user,
    amount,
    { number: body.payoutNumber, bank: body.payoutBank },
    // Both halves of the exemption. Forcing withdrawal_approved clears gate 3
    // on its own and leaves gate 2 standing, which refused a sub-admin for not
    // having deposited — the exact history a commission balance does not have.
    { skipDepositGate: exempt },
  );

  // Save the payout details for next time, whether or not the gate opens.
  const payoutNumber = body.payoutNumber?.trim() || user.payout_number;
  const payoutBank = body.payoutBank?.trim() || user.payout_bank;

  if (payoutNumber !== user.payout_number || payoutBank !== user.payout_bank) {
    await supabase
      .from("users")
      .update({ payout_number: payoutNumber, payout_bank: payoutBank })
      .eq("id", user.id);
  }

  if (!gate.ok) {
    // Gate 3 is not a refusal. The request is recorded as pending and the
    // player is told it is being processed, rather than shown a lock screen.
    if (gate.failed === "approval") {
      // The gate stops at approval before it ever weighs the amount, so this
      // path must do that itself. It did not, and a player asked for more
      // than they held twice in two minutes: each request deducted in full,
      // and the second took a balance of 500.90 to -6,727.10 -- a negative
      // figure on their account screen.
      if (!(amount > 0) || amount > Number(user.balance)) {
        return NextResponse.json(
          { error: "Amount is more than your balance", gate: "details", progress: gate.progress },
          { status: 400 },
        );
      }

      // The money leaves the balance now, exactly as it does on the approved
      // path. It used to sit here undeducted, so a player could stack request
      // after request against the same funds -- one had asked for four times
      // the balance they held across several pending rows, and paying those
      // out would have paid four times what was owed.
      //
      // Conditioned on the balance so two requests racing cannot both win.
      const held = Number(user.balance);
      const nextBalance = Math.round((held - amount) * 100) / 100;
      const { data: reserved } = await supabase
        .from("users")
        .update({ balance: nextBalance })
        .eq("id", user.id)
        .eq("balance", held)
        .select("id")
        .maybeSingle();

      if (!reserved) {
        return NextResponse.json({ error: "Your balance changed. Try again." }, { status: 409 });
      }

      const reference = paymentReference("WDR");
      const { error: rowErr } = await supabase.from("payments").insert({
        reference,
        user_id: user.id,
        amount,
        currency: user.currency,
        provider: "manual",
        status: "pending",
        metadata: {
          type: "withdrawal",
          awaiting_approval: true,
          // Says the balance was actually taken. Rows written before this
          // existed carry no such flag, and must never be refunded: nothing
          // was ever deducted for them.
          debited: true,
          payout_number: payoutNumber,
          payout_bank: payoutBank,
        },
      });

      if (rowErr) {
        console.error("[withdrawal] ledger write failed, refunding", user.id, rowErr);
        await supabase.from("users").update({ balance: held }).eq("id", user.id);
        return NextResponse.json({ error: "Could not submit your withdrawal" }, { status: 500 });
      }

      if (exempt) {
        await sendSms(user.phone, withdrawalRequestedSms(amount, user.currency)).catch(() => {});
      }

      return NextResponse.json({
        status: "processing",
        reference,
        message: gate.message,
        amount,
        balance: nextBalance,
        currency: user.currency,
        // The balance in the banner is the wallet after this deduction.
        // Players do not get the banner. Admin and approved sub-admin do.
        notify: exempt,
      });
    }

    return NextResponse.json({ error: gate.message, gate: gate.failed, progress: gate.progress }, { status: 400 });
  }

  // --- All three gates passed: take the money out ------------------------
  const balance = Number(user.balance);
  const nextBalance = Math.round((balance - amount) * 100) / 100;
  const { data: debited } = await supabase
    .from("users")
    .update({
      balance: nextBalance,
      total_withdrawn: Math.round((Number(user.total_withdrawn) + amount) * 100) / 100,
    })
    .eq("id", user.id)
    .eq("balance", balance)
    .select("id")
    .maybeSingle();

  if (!debited) {
    return NextResponse.json({ error: "Your balance changed. Try again." }, { status: 409 });
  }

  const country = getCountry(user.country_code);
  const reference = paymentReference("WDR");

  const { error } = await supabase.from("payments").insert({
    reference,
    user_id: user.id,
    amount,
    currency: user.currency,
    provider: "manual",
    status: "pending",
    metadata: {
      type: "withdrawal",
      awaiting_approval: false,
      rail: country.payoutRail,
      payout_number: payoutNumber,
      payout_bank: payoutBank,
    },
  });

  if (error) {
    console.error("[withdrawal] ledger write failed, refunding", user.id, error);
    await supabase
      .from("users")
      .update({ balance, total_withdrawn: Number(user.total_withdrawn) })
      .eq("id", user.id);
    return NextResponse.json({ error: "Could not submit your withdrawal" }, { status: 500 });
  }

  if (exempt) {
    await sendSms(user.phone, withdrawalRequestedSms(amount, user.currency)).catch(() => {});
  }

  return NextResponse.json({
    status: "submitted",
    reference,
    amount,
    balance: nextBalance,
    currency: user.currency,
    message: "Your withdrawal is on its way. It is usually paid within a few minutes.",
    notify: exempt,
  });
}
