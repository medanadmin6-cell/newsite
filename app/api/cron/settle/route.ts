import { NextResponse } from "next/server";
import { settleBets } from "@/lib/settle";

export const dynamic = "force-dynamic";

/**
 * Settlement backstop for a site with no traffic.
 *
 * Most settlement rides on the fixture feed; this exists so a quiet site still
 * settles. Supabase calls it every minute (migration 0018_settle_schedule);
 * the daily Vercel cron in vercel.json stays as a second safety net.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
  }

  const report = await settleBets({ force: true });
  return NextResponse.json({ ok: true, report });
}
