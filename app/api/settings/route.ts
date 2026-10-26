import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** The operator-editable values the player-facing screens need to render. */
const PUBLIC_KEYS = ["deposit_account_name", "deposit_account_number", "deposit_account_network"];

export async function GET() {
  const supabase = db();
  if (!supabase) return NextResponse.json({ settings: {} });

  const { data } = await supabase.from("app_settings").select("key, value").in("key", PUBLIC_KEYS);
  return NextResponse.json({
    settings: Object.fromEntries((data ?? []).map((r) => [r.key, r.value])),
  });
}
