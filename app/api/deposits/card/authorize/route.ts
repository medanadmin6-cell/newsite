import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorizeCharge, type Authorization } from "@/lib/flutterwave-v4";

export const dynamic = "force-dynamic";

/**
 * The step after the charge: a card PIN, the OTP the bank sent, or the address
 * an international card is checked against. Which one was asked for came back
 * with the charge, and comes back here to be answered.
 */
export async function POST(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  let body: {
    reference?: string;
    userId?: string;
    type?: string;
    pin?: string;
    code?: string;
    address?: Record<string, string>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const reference = String(body.reference ?? "");
  if (!reference) return NextResponse.json({ error: "Missing reference" }, { status: 400 });
  if (!body.userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const { data: payment } = await supabase
    .from("payments")
    .select("reference, user_id, provider, status, metadata")
    .eq("reference", reference)
    .maybeSingle();

  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (payment.user_id !== body.userId) return NextResponse.json({ error: "Not your deposit" }, { status: 403 });

  const chargeId = (payment.metadata as Record<string, unknown> | null)?.charge_id;
  if (typeof chargeId !== "string" || !chargeId) {
    return NextResponse.json({ error: "That payment has not started yet" }, { status: 409 });
  }

  let auth: Authorization;
  switch (body.type) {
    case "pin": {
      const pin = String(body.pin ?? "").replace(/\D/g, "");
      if (pin.length < 4) return NextResponse.json({ error: "Enter your card PIN" }, { status: 400 });
      auth = { type: "pin", pin };
      break;
    }
    case "otp": {
      const code = String(body.code ?? "").trim();
      if (!code) return NextResponse.json({ error: "Enter the code you were sent" }, { status: 400 });
      auth = { type: "otp", code };
      break;
    }
    case "avs": {
      const address = body.address ?? {};
      if (!address.line1 || !address.city || !address.country) {
        return NextResponse.json({ error: "Fill in the billing address" }, { status: 400 });
      }
      auth = { type: "avs", address };
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown authorization step" }, { status: 400 });
  }

  const result = await authorizeCharge(chargeId, auth);
  if (!result.ok || !result.data) {
    return NextResponse.json({ error: result.error ?? "That did not go through" }, { status: 502 });
  }

  return NextResponse.json({ step: result.data.step });
}
