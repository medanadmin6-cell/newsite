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

  // Both are throttled internally and neither is allowed to fail the response.
  const work = Promise.allSettled([settleBets(), dispatchGoalAlerts(feed)]);
  work.then((results) => {
    for (const r of results) {
      if (r.status === "rejected") console.error("[fixtures] background work failed", r.reason);
    }
  });

  return NextResponse.json(
    { matches: feed, count: feed.length, at: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
