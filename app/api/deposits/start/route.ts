import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { getCountry, formatMoney } from "@/lib/countries";
import { depositsInCedis, ghsPerUsd, ghsToUsd, MIN_WALLET_DEPOSIT, usdToGhs } from "@/lib/fx";
import { adapterFor } from "@/lib/gateways";
import { paymentReference } from "@/lib/codes";

/**
 * Start a deposit on the player's country gateway.
 *
 * A pending payment row is written before the gateway is called, so the
 * reference exists no matter how the player leaves the flow. Reconciliation and
 * webhooks both key off that row.
 */
export async function POST(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  let body: { userId?: string; amount?: number; phone?: string; network?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!body.userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Enter an amount" }, { status: 400 });
  }

  const { data: user } = await supabase
    .from("users")
    .select("id, name, phone, email, country_code, currency, first_deposit_at")
    .eq("id", body.userId)
    .maybeSingle();

  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const country = getCountry(user.country_code);
  const cedis = depositsInCedis(user.country_code);
  // Ghana sends dollars. The mobile-money prompt is the cedi equivalent.
  const walletAmount = amount;
  const rate = ghsPerUsd();
  const charge = cedis ? usdToGhs(walletAmount, rate) : walletAmount;
  const chargeCurrency = cedis ? "GHS" : user.currency;
  const minWallet = cedis ? MIN_WALLET_DEPOSIT : country.minDeposit;
  const maxWallet = cedis ? ghsToUsd(country.maxDeposit, rate) : country.maxDeposit;

  if (!user.first_deposit_at && walletAmount < (cedis ? MIN_WALLET_DEPOSIT : country.minFirstDeposit)) {
    return NextResponse.json(
      { error: `Minimum first deposit is ${cedis ? formatMoney(MIN_WALLET_DEPOSIT, "USD") : `${country.currencySymbol}${country.minFirstDeposit}`}` },
      { status: 400 },
    );
  }

  // The ordinary floor and ceiling, checked here and not only on the deposit
  // screen: the screen greys out its own button, but nothing stops a request
  // being posted straight at this endpoint, so a limit that lives only in the
  // browser is not a limit. The rail has its own bounds too, and a charge it
  // refuses is a worse way for a player to find out.
  if (walletAmount < minWallet) {
    return NextResponse.json(
      { error: `The smallest deposit is ${cedis ? formatMoney(MIN_WALLET_DEPOSIT, "USD") : `${country.currencySymbol}${country.minDeposit}`}` },
      { status: 400 },
    );
  }
  if (walletAmount > maxWallet) {
    return NextResponse.json(
      { error: `The largest single deposit is ${cedis ? formatMoney(maxWallet, "USD") : `${country.currencySymbol}${country.maxDeposit}`}` },
      { status: 400 },
    );
  }

  const adapter = adapterFor(country.gateway);
  const reference = paymentReference();
  const origin = new URL(req.url).origin;

  const { error: insertErr } = await supabase.from("payments").insert({
    reference,
    user_id: user.id,
    amount: charge,
    currency: chargeCurrency,
    provider: adapter.id,
    status: "pending",
    metadata: {
      type: "deposit",
      gateway: adapter.id,
      ...(cedis ? { walletAmount, walletCurrency: "USD", quotedGhs: charge, fxRate: rate } : {}),
    },
  });

  if (insertErr) {
    console.error("[deposit] could not record payment", insertErr);
    return NextResponse.json({ error: "Could not start your deposit" }, { status: 500 });
  }

  const result = await adapter.start({
    reference,
    amount: charge,
    currency: chargeCurrency,
    phone: body.phone?.replace(/\D/g, "") || user.phone,
    email: user.email ?? "",
    name: user.name,
    userId: user.id,
    // What the player picked on the deposit screen. The rail is told that
    // rather than what their prefix implies, because a ported number makes
    // the prefix wrong and the charge is refused on it.
    network: body.network,
    redirectUrl: `${origin}/account?ref=${reference}`,
  });

  if (!result.ok) {
    // Keep whatever the rail told us about the attempt. A failed charge still
    // has an id on their side, and without it on the row there is no way to
    // ask them afterwards what went wrong -- which is exactly the position a
    // refused deposit leaves an operator in.
    await supabase
      .from("payments")
      .update({
        status: "failed",
        metadata: {
          type: "deposit",
          gateway: adapter.id,
          ...(cedis ? { walletAmount, walletCurrency: "USD", quotedGhs: charge, fxRate: rate } : {}),
          ...(result.metadata ?? {}),
        },
      })
      .eq("reference", reference);
    return NextResponse.json({ error: result.error ?? "Could not start your deposit" }, { status: 502 });
  }

  // The rail's own charge id is the authoritative way to ask after this
  // payment later, so it goes on the row the moment we have it.
  if (result.metadata) {
    await supabase
      .from("payments")
      .update({
        metadata: {
          type: "deposit",
          gateway: adapter.id,
          ...(cedis ? { walletAmount, walletCurrency: "USD", quotedGhs: charge, fxRate: rate } : {}),
          ...result.metadata,
        },
      })
      .eq("reference", reference);
  }

  return NextResponse.json({
    reference,
    provider: adapter.id,
    redirectUrl: result.redirectUrl ?? null,
    awaitingPrompt: result.awaitingPrompt ?? false,
    awaitingOtp: result.awaitingOtp ?? false,
  });
}
