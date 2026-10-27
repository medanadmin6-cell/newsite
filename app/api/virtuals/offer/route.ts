import { NextResponse } from "next/server";
import { freshBoard } from "@/lib/virtuals";

export const dynamic = "force-dynamic";

/** A new signed Instant Football board: every league, one signature. */
export async function GET() {
  try {
    return NextResponse.json(freshBoard());
  } catch (err) {
    console.error("[virtuals] offer failed", err);
    return NextResponse.json({ error: "Virtuals are unavailable" }, { status: 503 });
  }
}
