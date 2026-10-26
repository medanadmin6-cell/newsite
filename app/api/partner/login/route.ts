import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/supabase";
import { signPartner, PARTNER_COOKIE, partnerCookieOptions } from "@/lib/auth";

export async function POST(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return NextResponse.json({ error: "Enter your details" }, { status: 400 });
  }

  const { data: partner } = await supabase
    .from("sub_admins")
    .select("id, name, email, referral_code, approved, password_hash")
    .eq("email", String(body.email).trim().toLowerCase())
    .maybeSingle();

  const rejection = NextResponse.json({ error: "Wrong login details" }, { status: 401 });
  if (!partner) {
    await bcrypt.compare(body.password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
    return rejection;
  }

  if (!(await bcrypt.compare(body.password, partner.password_hash))) return rejection;

  const { password_hash, ...safe } = partner;

  const res = NextResponse.json({ partner: safe });
  res.cookies.set(PARTNER_COOKIE, signPartner(partner.id, password_hash), partnerCookieOptions());
  return res;
}
