import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { getCountry } from "@/lib/countries";
import { paymentReference } from "@/lib/codes";

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

/**
 * The manual mobile-money rail: every market without a configured gateway, and
 * a fallback for any market whose gateway is having a bad day.
 *
 * The player sends money to the displayed agent number and uploads a
 * screenshot. This records a PENDING payment for the operator to confirm — no
 * money moves here.
 */
export async function POST(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const userId = String(form.get("userId") ?? "");
  const amount = Number(form.get("amount"));
  const senderNumber = String(form.get("senderNumber") ?? "").trim();
  const screenshot = form.get("screenshot");

  if (!userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Enter the amount you sent" }, { status: 400 });
  }

  const { data: user } = await supabase
    .from("users")
    .select("id, phone, country_code, currency, first_deposit_at")
    .eq("id", userId)
    .maybeSingle();

  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const country = getCountry(user.country_code);
  if (!user.first_deposit_at && amount < country.minFirstDeposit) {
    return NextResponse.json(
      { error: `Minimum first deposit is ${country.currencySymbol}${country.minFirstDeposit}` },
      { status: 400 },
    );
  }

  const reference = paymentReference("MAN");
  let screenshotPath: string | null = null;

  if (screenshot instanceof File && screenshot.size > 0) {
    if (screenshot.size > MAX_SCREENSHOT_BYTES) {
      return NextResponse.json({ error: "That image is too large (max 5MB)" }, { status: 413 });
    }
    if (!ALLOWED_TYPES.includes(screenshot.type)) {
      return NextResponse.json({ error: "Upload a JPG, PNG or WebP image" }, { status: 415 });
    }

    const ext = screenshot.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${userId}/${reference}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("deposit-screenshots")
      .upload(path, screenshot, { contentType: screenshot.type, upsert: false });

    if (uploadErr) {
      // A failed upload must not block the deposit claim: the operator can
      // still confirm it against their own mobile-money statement.
      console.error("[manual-deposit] screenshot upload failed", uploadErr);
    } else {
      screenshotPath = path;
    }
  }

  const { error } = await supabase.from("payments").insert({
    reference,
    user_id: user.id,
    amount,
    currency: user.currency,
    provider: "manual",
    status: "pending",
    metadata: {
      type: "deposit",
      gateway: "manual",
      sender_number: senderNumber || user.phone,
      screenshot: screenshotPath,
    },
  });

  if (error) {
    console.error("[manual-deposit] insert failed", error);
    return NextResponse.json({ error: "Could not record your deposit" }, { status: 500 });
  }

  return NextResponse.json({
    reference,
    status: "pending",
    message: "We have your deposit. It will reflect once our team confirms it.",
  });
}
