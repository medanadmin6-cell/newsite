import { NextResponse } from "next/server";
import { getFeed } from "@/lib/fixtures";
import { getTracker } from "@/lib/tracker";

export const dynamic = "force-dynamic";

/**
 * Everything the tracker view needs for one match: the match itself, and what
 * has happened in it.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const feed = await getFeed();
  const match = feed.find((m) => m.id === id) ?? null;

  const tracker = await getTracker(id);

  if (!match && !tracker.events.length) {
    return NextResponse.json({ error: "Nothing to track on this match" }, { status: 404 });
  }

  return NextResponse.json(
    { match, ...tracker },
    { headers: { "Cache-Control": "no-store" } },
  );
}
