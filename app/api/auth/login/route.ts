import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/supabase";
import { normalisePhone, allCountries } from "@/lib/countries";

/** Login accepts either the email or the phone number. */
export async function POST(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  let body: { identifier?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const identifier = (body.identifier ?? "").trim();
  const password = body.password ?? "";

  if (!identifier || !password) {
    return NextResponse.json({ error: "Enter your details" }, { status: 400 });
  }

  let user = null;

  if (identifier.includes("@")) {
    const { data } = await supabase
      .from("users")
      .select("id, name, phone, email, country_code, currency, balance, password_hash")
      .eq("email", identifier.toLowerCase())
      .maybeSingle();
    user = data;
  } else {
    // The number may be typed local or international, and we do not know the
    // country until we find the player — so try each market's normalisation.
    const candidates = new Set<string>([identifier.replace(/\D/g, "")]);
    for (const c of allCountries()) {
      const n = normalisePhone(identifier, c.code);
      if (n) candidates.add(n);
    }

    const { data } = await supabase
      .from("users")
      .select("id, name, phone, email, country_code, currency, balance, password_hash")
      .in("phone", [...candidates])
      .maybeSingle();
    user = data;
  }

  // Same message either way, so the form does not confirm which numbers exist.
  const rejection = NextResponse.json({ error: "Wrong login details" }, { status: 401 });
  if (!user) {
    await bcrypt.compare(password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
    return rejection;
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return rejection;

  const { password_hash: _hash, ...safe } = user;
  void _hash;

  return NextResponse.json({ user: safe });
}
