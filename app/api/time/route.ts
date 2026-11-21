import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The server's clock. Browsers use it to correct a device whose own clock is
 * wrong: a phone set hours off made matches look live, or finished, long
 * before their kickoff.
 */
export function GET() {
  return NextResponse.json({ now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
