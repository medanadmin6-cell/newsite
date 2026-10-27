import { NextResponse } from "next/server";
import { asRow, db, missingColumn } from "@/lib/supabase";
import { getCountry } from "@/lib/countries";
import { checkWithdrawalGate, qualifiesForApproval, type GateSubject } from "@/lib/withdrawals";

interface MeUser extends GateSubject {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  total_withdrawn: number | string;
  verification_step: number;
  bonus_paid: boolean;
  created_at: string;
}
import { linkedSubAdmin } from "@/lib/partner";
import { requireAdmin } from "@/lib/admin-guard";

/**
 * The signed-in player's own record.
 *
 * The player id arrives as a query parameter because there is no server
 * session — see the security note in the README. Anything added here is
 * readable by anyone who learns a player id.
 */
export async function GET(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const columns =
    "id, name, phone, email, country_code, currency, balance, total_deposited, total_withdrawn, verification_step, qualifying_deposits, verification_topup, withdrawal_approved, payout_number, payout_bank, bonus_paid, created_at";
  let { data, error } = await supabase.from("users").select(columns).eq("id", userId).maybeSingle();
  let user = asRow<MeUser>(data);
  if (missingColumn(error, "verification_topup")) {
    const again = await supabase
      .from("users")
      .select(columns.replace(", verification_topup", ""))
      .eq("id", userId)
      .maybeSingle();
    const row = asRow<Omit<MeUser, "verification_topup">>(again.data);
    user = row ? { ...row, verification_topup: false } : null;
    error = again.error;
  }

  if (error || !user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const country = getCountry(user.country_code);
  const gate = checkWithdrawalGate(user, 0);

  // Tier points come from turnover, so they are summed off the stakes. The
  // same rows carry the open-ticket count for the My Bets badge, so the badge
  // costs no extra query.
  const { data: staked } = await supabase
    .from("bets")
    .select("stake, status")
    .eq("user_id", user.id);
  const tierPoints = (staked ?? []).reduce((sum, b) => sum + Number(b.stake), 0);
  const openBets = (staked ?? []).filter((b) => b.status === "pending").length;

  // A partner betting on their own account sees a way back to the dashboard.
  const linked = await linkedSubAdmin(user);
  const { data: partner } = linked
    ? await supabase
        .from("sub_admins")
        .select("id, referral_code, approved")
        .eq("id", linked.id)
        .maybeSingle()
    : { data: null };

  // Passed the deposit verification, or exempt from it. An approved sub-admin
  // and the operator skip it. Partner registration is open to anyone, so a
  // merely-linked account has cleared nothing. Same rule the endpoint uses.
  const isAdmin = await requireAdmin();
  const verified = isAdmin || Boolean(partner?.approved) || qualifiesForApproval(user);

  return NextResponse.json({
    user,
    country: {
      code: country.code,
      name: country.name,
      currency: country.currency,
      currencySymbol: country.currencySymbol,
      minFirstDeposit: country.minFirstDeposit,
      gateway: country.gateway,
      payoutRail: country.payoutRail,
      networks: country.networks,
    },
    withdrawal: {
      // An approved sub-admin and the operator skip the deposit verification.
      // Everyone else has to finish it, including the extra verification
      // deposit, before the withdraw form is worth showing.
      //
      // This reports the verification alone, not the whole gate: no amount is
      // known on this read, and checkWithdrawalGate fails a zero amount on the
      // balance check, so asking it outright would lock every player out.
      unlocked: verified,
      failed: verified ? undefined : "deposits",
      progress: gate.progress,
    },
    partner: partner ?? null,
    tierPoints: Math.floor(tierPoints),
    openBets,
  });
}
