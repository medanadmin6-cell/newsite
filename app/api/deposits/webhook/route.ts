import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/supabase";
import { applyDepositCredit } from "@/lib/money";

/**
 * Gateway webhooks. One endpoint, one shape per provider.
 *
 * The signature is verified before anything is read out of the body, and the
 * credit itself is idempotent, so a provider retrying the same event is
 * harmless.
 */
export async function POST(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ ok: false }, { status: 503 });

  const raw = await req.text();
  const provider = detectProvider(req);

  if (!verify(provider, req, raw)) {
    console.warn("[webhook] rejected bad signature", provider);
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { reference, successful } = extract(provider, event);
  if (!reference) return NextResponse.json({ ok: true, ignored: true });

  const { data: payment } = await supabase
    .from("payments")
    .select("reference, user_id, amount, currency, provider, status")
    .eq("reference", reference)
    .maybeSingle();

  if (!payment) return NextResponse.json({ ok: true, ignored: true });

  if (!successful) {
    if (payment.status === "pending") {
      await supabase.from("payments").update({ status: "failed" }).eq("reference", reference);
    }
    return NextResponse.json({ ok: true });
  }

  await applyDepositCredit({
    userId: payment.user_id,
    amount: Number(payment.amount),
    currency: payment.currency,
    reference,
    provider: payment.provider,
  });

  return NextResponse.json({ ok: true });
}

function detectProvider(req: Request): string {
  if (req.headers.get("verif-hash")) return "flutterwave";
  if (req.headers.get("x-korapay-signature")) return "korapay";
  if (req.headers.get("x-paystack-signature")) return "paystack";
  return "moolre";
}

function safeCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function verify(provider: string, req: Request, raw: string): boolean {
  switch (provider) {
    case "flutterwave": {
      const expected = process.env.FLUTTERWAVE_WEBHOOK_HASH;
      const got = req.headers.get("verif-hash") ?? "";
      return Boolean(expected) && safeCompare(got, expected!);
    }
    case "paystack": {
      const key = process.env.PAYSTACK_SECRET_KEY;
      if (!key) return false;
      const expected = createHmac("sha512", key).update(raw).digest("hex");
      return safeCompare(req.headers.get("x-paystack-signature") ?? "", expected);
    }
    case "korapay": {
      const key = process.env.KORAPAY_SECRET_KEY;
      if (!key) return false;
      let payload = raw;
      try {
        payload = JSON.stringify(JSON.parse(raw).data);
      } catch {
        /* fall back to the raw body */
      }
      const expected = createHmac("sha256", key).update(payload).digest("hex");
      return safeCompare(req.headers.get("x-korapay-signature") ?? "", expected);
    }
    default: {
      const secret = process.env.MOOLRE_WEBHOOK_SECRET;
      if (!secret) return false;
      const expected = createHmac("sha256", secret).update(raw).digest("hex");
      return safeCompare(req.headers.get("x-moolre-signature") ?? "", expected);
    }
  }
}

function extract(provider: string, event: Record<string, unknown>): { reference?: string; successful: boolean } {
  const data = (event.data ?? event) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);

  switch (provider) {
    case "flutterwave":
      return {
        reference: str(data.tx_ref) ?? str(data.txRef),
        successful: String(data.status ?? "").toLowerCase() === "successful",
      };
    case "paystack":
      return {
        reference: str(data.reference),
        successful: String(event.event ?? "") === "charge.success",
      };
    case "korapay":
      return {
        reference: str(data.reference),
        successful: String(event.event ?? "") === "charge.success",
      };
    default:
      return {
        reference: str(data.externalref) ?? str(data.reference),
        successful: Number(data.txstatus ?? data.status) === 1,
      };
  }
}
