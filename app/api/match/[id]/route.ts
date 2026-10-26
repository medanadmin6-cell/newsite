import { NextResponse } from "next/server";
import { getMatchDetail } from "@/lib/fixtures";

export const dynamic = "force-dynamic";

/**
 * One match with every market upstream prices for it.
 *
 * The board's derived markets are the fallback; this is the real set, fetched
 * on demand so opening a match costs one upstream request rather than pricing
 * the whole card.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const match = await getMatchDetail(id);
  if (!match) {
    return NextResponse.json({ error: "That match is no longer available" }, { status: 404 });
  }

  return NextResponse.json({ match }, { headers: { "Cache-Control": "no-store" } });
}
