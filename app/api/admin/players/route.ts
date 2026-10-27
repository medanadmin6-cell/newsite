import { NextResponse } from "next/server";
import { asRows, db, missingColumn } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-guard";
import { checkWithdrawalGate, qualifiesForApproval, type GateSubject } from "@/lib/withdrawals";

interface PlayerRow extends GateSubject {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  total_withdrawn: number | string;
  verification_step: number;
  referred_by: string | null;
  created_at: string;
}

export const dynamic = "force-dynamic";

/**
 * The players list.
 *
 * The progress badge is computed from the same gate module the withdrawal
 * endpoint uses, so the console can never offer Approve to a player the
 * endpoint would still block.
 */
export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") ?? "all";
  const search = url.searchParams.get("q")?.trim();

  const columns =
    "id, name, phone, email, country_code, currency, balance, total_deposited, total_withdrawn, verification_step, qualifying_deposits, verification_topup, withdrawal_approved, payout_number, payout_bank, referred_by, created_at";

  // "unverified" is not a column test. verification_step counts deposits over
  // the verification amount and caps at 4, while the gate that actually blocks
  // a withdrawal counts qualifying deposits against the country's own target.
  // Filtering on the first showed the operator a different set of players from
  // the ones the Approve button was refusing, so it is computed below.
  const load = (cols: string) => {
    let query = supabase.from("users").select(cols).order("created_at", { ascending: false }).limit(200);
    if (filter === "depositors") query = query.gt("total_deposited", 0);
    if (filter === "approved") query = query.eq("withdrawal_approved", true);
    if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    return query;
  };

  let { data, error } = await load(columns);
  let rows = asRows<PlayerRow>(data);
  // This project was created before the extra verification column. The list
  // still loads; those players simply have not paid the extra deposit.
  if (missingColumn(error, "verification_topup")) {
    const again = await load(columns.replace(", verification_topup", ""));
    rows = asRows<Omit<PlayerRow, "verification_topup">>(again.data).map((row) => ({
      ...row,
      verification_topup: false,
    }));
    error = again.error;
  }
  if (error) {
    console.error("[admin] players", error);
    return NextResponse.json({ error: "Could not load players" }, { status: 500 });
  }

  let players = rows.map((u) => {
    const gate = checkWithdrawalGate(u, 0);
    return {
      ...u,
      gate: {
        progress: gate.progress,
        qualifies: qualifiesForApproval(u),
        unlocked: gate.ok,
      },
    };
  });

  // These are computed states, so they filter after the query -- on the same
  // gate the withdrawal endpoint enforces, so the console and the endpoint can
  // never disagree about who is verified.
  if (filter === "awaiting") {
    players = players.filter((p) => p.gate.qualifies && !p.withdrawal_approved);
  }
  if (filter === "unverified") {
    players = players.filter((p) => !p.gate.qualifies);
  }

  return NextResponse.json({ players });
}

/** Credit a wallet by hand, or approve/revoke withdrawals. */
export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  let body: { userId?: string; action?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { userId, action } = body;
  if (!userId || !action) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { data: user } = await supabase
    .from("users")
    .select("id, balance, withdrawal_approved")
    .eq("id", userId)
    .maybeSingle();

  if (!user) return NextResponse.json({ error: "Player not found" }, { status: 404 });

  if (action === "approve" || action === "revoke") {
    await supabase
      .from("users")
      .update({ withdrawal_approved: action === "approve" })
      .eq("id", userId);
    return NextResponse.json({ ok: true, withdrawal_approved: action === "approve" });
  }

  if (action === "credit") {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      return NextResponse.json({ error: "Enter an amount" }, { status: 400 });
    }
    // A hand credit is a correction, not a deposit: it moves the balance only,
    // and deliberately skips the bonus, commission and verification steps.
    const next = Math.max(0, Number(user.balance) + amount);
    await supabase.from("users").update({ balance: next }).eq("id", userId);
    console.info("[admin] hand credit", { userId, amount, balance: next });
    return NextResponse.json({ ok: true, balance: next });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
