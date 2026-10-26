import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { bookingCode } from "@/lib/codes";

/** Book a slip rather than placing it: store the selections under a code. */
export async function POST(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  let body: { userId?: string; selections?: unknown[]; expiresInHours?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const selections = body.selections ?? [];
  if (!selections.length) return NextResponse.json({ error: "Your slip is empty" }, { status: 400 });

  const expiresAt = body.expiresInHours
    ? new Date(Date.now() + body.expiresInHours * 3_600_000).toISOString()
    : null;

  // Codes are short, so retry on the rare collision rather than widening them.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = bookingCode();
    const { error } = await supabase.from("bookings").insert({
      code,
      selections,
      created_by: body.userId ?? null,
      expires_at: expiresAt,
    });

    if (!error) return NextResponse.json({ code, expiresAt });
    if ((error as { code?: string }).code !== "23505") {
      console.error("[booking] insert failed", error);
      return NextResponse.json({ error: "Could not book your slip" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Could not book your slip" }, { status: 500 });
}
