import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { getCountry } from "@/lib/countries";
import { createCardPaymentMethod, createCharge, createCustomer } from "@/lib/flutterwave-v4";

export const dynamic = "force-dynamic";

/**
 * Charge the card the player typed on our checkout page.
 *
 * The card is encrypted in `flutterwave-v4` and forwarded; it is never written
 * to the database and never logged. What we keep is the charge id, so the
 * authorization step and the status poll have something to ask about.
 */
export async function POST(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  let body: {
    reference?: string;
    userId?: string;
    number?: string;
    expiry?: string;
    cvv?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const reference = String(body.reference ?? "");
  if (!reference) return NextResponse.json({ error: "Missing reference" }, { status: 400 });
  if (!body.userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const number = String(body.number ?? "").replace(/\D/g, "");
  const cvv = String(body.cvv ?? "").replace(/\D/g, "");
  const [rawMonth, rawYear] = String(body.expiry ?? "").split("/");
  const month = String(rawMonth ?? "").replace(/\D/g, "").padStart(2, "0");
  // A player may type either 2028 or 28. The rail wants the short form.
  const year = String(rawYear ?? "").replace(/\D/g, "").slice(-2);

  if (number.length < 12 || number.length > 19) return NextResponse.json({ error: "Check the card number" }, { status: 400 });
  if (month.length !== 2 || Number(month) < 1 || Number(month) > 12 || year.length !== 2) {
    return NextResponse.json({ error: "Check the expiry date" }, { status: 400 });
  }
  if (cvv.length < 3 || cvv.length > 4) return NextResponse.json({ error: "Check the CVV" }, { status: 400 });

  const { data: payment } = await supabase
    .from("payments")
    .select("reference, user_id, amount, currency, provider, status, metadata")
    .eq("reference", reference)
    .maybeSingle();

  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (payment.user_id !== body.userId) return NextResponse.json({ error: "Not your deposit" }, { status: 403 });
  if (payment.provider !== "flutterwave_card") {
    return NextResponse.json({ error: "That deposit is not a card payment" }, { status: 400 });
  }
  if (payment.status !== "pending") {
    return NextResponse.json({ error: "That deposit is already settled" }, { status: 409 });
  }

  const meta = (payment.metadata ?? {}) as Record<string, unknown>;
  if (meta.charge_id) {
    return NextResponse.json({ error: "This deposit has already been charged" }, { status: 409 });
  }

  const { data: user } = await supabase
    .from("users")
    .select("id, name, phone, email, country_code")
    .eq("id", payment.user_id)
    .maybeSingle();

  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const country = getCountry(user.country_code);

  const customer = await createCustomer({
    email: user.email || `${user.phone}@3btafric.com`,
    name: user.name,
    phone: user.phone,
    dialCode: country.dialCode,
    reference,
  });
  if (!customer.ok || !customer.data?.id) {
    return NextResponse.json({ error: customer.error ?? "Could not start the payment" }, { status: 502 });
  }

  const method = await createCardPaymentMethod({
    number,
    expiryMonth: month,
    expiryYear: year,
    cvv,
  });
  if (!method.ok || !method.data?.id) {
    return NextResponse.json({ error: method.error ?? "That card was not accepted" }, { status: 502 });
  }

  const origin = new URL(req.url).origin;
  const charge = await createCharge({
    reference,
    amount: Number(payment.amount),
    currency: payment.currency,
    customerId: customer.data.id,
    paymentMethodId: method.data.id,
    redirectUrl: `${origin}/checkout/return?reference=${encodeURIComponent(reference)}`,
  });

  if (!charge.ok || !charge.data) {
    return NextResponse.json({ error: charge.error ?? "That payment did not go through" }, { status: 502 });
  }

  await supabase
    .from("payments")
    .update({
      metadata: { ...meta, charge_id: charge.data.chargeId, customer_id: customer.data.id },
    })
    .eq("reference", reference);

  return NextResponse.json({ step: charge.data.step });
}
