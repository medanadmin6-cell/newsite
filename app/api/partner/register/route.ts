import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/supabase";
import { referralCode } from "@/lib/auth";

/**
 * Partners register themselves and wait for the operator to approve them.
 * Until approved they can sign in but earn nothing.
 */
export async function POST(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim() || !body?.email?.trim() || !body?.password) {
    return NextResponse.json({ error: "Fill in every field" }, { status: 400 });
  }
  if (body.password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const email = body.email.trim().toLowerCase();

  const { data: existing } = await supabase.from("sub_admins").select("id").eq("email", email).maybeSingle();
  if (existing) return NextResponse.json({ error: "That email already has an account" }, { status: 409 });

  const passwordHash = await bcrypt.hash(body.password, 10);

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = referralCode();
    const { data, error } = await supabase
      .from("sub_admins")
      .insert({
        name: body.name.trim(),
        email,
        phone: body.phone?.trim() || null,
        password_hash: passwordHash,
        referral_code: code,
        approved: false,
      })
      .select("id, name, email, referral_code, approved")
      .single();

    if (!error && data) {
      return NextResponse.json({
        partner: data,
        message: "Your account is created. An operator will approve it shortly.",
      });
    }
    if ((error as { code?: string } | null)?.code !== "23505") {
      console.error("[partner] register failed", error);
      return NextResponse.json({ error: "Could not create your account" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Could not create your account" }, { status: 500 });
}
