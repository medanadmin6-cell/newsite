import { NextResponse } from "next/server";
import { freshRound } from "@/lib/virtuals";

export const dynamic = "force-dynamic";

/** A new signed Instant Football round for one league. */
export async function GET(req: Request) {
  const league = new URL(req.url).searchParams.get("league") ?? "england";
  try {
    const offered = freshRound(league);
    if (!offered) return NextResponse.json({ error: "Unknown league" }, { status: 400 });
    return NextResponse.json(offered);
  } catch (err) {
    console.error("[virtuals] offer failed", err);
    return NextResponse.json({ error: "Virtuals are unavailable" }, { status: 503 });
  }
}
