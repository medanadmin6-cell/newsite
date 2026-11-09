import { NextResponse } from "next/server";
import { getFeed } from "@/lib/fixtures";
import { settleBets } from "@/lib/settle";
import { dispatchGoalAlerts } from "@/lib/goals";

export const dynamic = "force-dynamic";

/**
 * The public fixture feed, polled every 30 seconds by every open page.
 *
 * This endpoint is also where most of the platform's background work happens.
 * Settlement and goal alerts ride on ordinary traffic — each self-throttled —
 * so the site keeps working on a hosting plan with a minimal cron allowance.
 * While the site has any traffic at all, a finished match settles within about
 * half a minute.
 */
export async function GET() {
  const feed = await getFeed();

  // Wait for settlement before answering. A finished match's tickets are
  // judged on this same poll, the way the feed is polled every 30 seconds.
  // Returning first lets the host freeze the function before the write lands,
  // which is how a full-time ticket stayed open. A failure here still returns
  // the board.
  const results = await Promise.allSettled([settleBets(), dispatchGoalAlerts(feed)]);
  for (const r of results) {
    if (r.status === "rejected") console.error("[fixtures] background work failed", r.reason);
  }

  return NextResponse.json(
    { matches: feed, count: feed.length, at: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
