import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { currentPartner } from "@/lib/partner";
import { getCountry, normalisePhone } from "@/lib/countries";

export const dynamic = "force-dynamic";

/**
 * The partner's betting account.
 *
 * GET returns it if one exists. POST opens one, reusing the partner's own name,
 * email and password hash — so the same password signs them in on either side —
 * and links the two rows.
 *
 * The response is a player record the client signs into, which is why this
 * never asks for a password: the partner cookie has already proved who they are.
 */
export async function GET() {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const partner = await currentPartner();
  if (!partner) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  if (!partner.user_id) return NextResponse.json({ player: null });

  const { data: player } = await supabase
    .from("users")
    .select("id, name, phone, email, country_code, currency, balance")
    .eq("id", partner.user_id)
    .maybeSingle();

  return NextResponse.json({ player: player ?? null });
}

export async function POST(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const partner = await currentPartner();
  if (!partner) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Already open — hand back the existing account rather than making a second.
  if (partner.user_id) {
    const { data: existing } = await supabase
      .from("users")
      .select("id, name, phone, email, country_code, currency, balance")
      .eq("id", partner.user_id)
      .maybeSingle();
    if (existing) return NextResponse.json({ player: existing });
  }

  const body = await req.json().catch(() => null);
  const country = getCountry(body?.countryCode);

  const phone = normalisePhone(body?.phone ?? partner.phone ?? "", country.code);
  if (!phone) {
    return NextResponse.json(
      { error: `Enter a valid ${country.name} phone number for the betting account` },
      { status: 400 },
    );
  }

  const { data: taken } = await supabase.from("users").select("id").eq("phone", phone).maybeSingle();
  if (taken) {
    return NextResponse.json(
      { error: "That phone number already has a player account. Sign in with it instead." },
      { status: 409 },
    );
  }

  const { data: player, error } = await supabase
    .from("users")
    .insert({
      name: partner.name,
      phone,
      email: partner.email,
      // The same credential works on both sides, so there is no second password
      // for the partner to remember.
      password_hash: partner.password_hash,
      country_code: country.code,
      currency: country.currency,
      // A partner is never their own referrer.
      referred_by: null,
    })
    .select("id, name, phone, email, country_code, currency, balance")
    .single();

  if (error || !player) {
    console.error("[partner] could not open betting account", partner.id, error);
    return NextResponse.json({ error: "Could not open the betting account" }, { status: 500 });
  }

  const { error: linkErr } = await supabase
    .from("sub_admins")
    .update({ user_id: player.id })
    .eq("id", partner.id);

  if (linkErr) {
    // Roll the account back rather than leaving an orphan the partner cannot reach.
    console.error("[partner] link failed, removing the orphan account", partner.id, linkErr);
    await supabase.from("users").delete().eq("id", player.id);
    return NextResponse.json({ error: "Could not link the betting account" }, { status: 500 });
  }

  return NextResponse.json({ player });
}
