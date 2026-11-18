import { alphapaySessionUrl } from "./alphapay-url";
import { alphapayPayoutFetch, isAlphapayPayoutPath } from "./alphapay-payout";
import type { Gateway } from "./countries";
import {
  cardsConfigured,
  chargePaid,
  createCharge,
  createCustomer,
  createMobileMoneyPaymentMethod,
  findChargeByReference,
  getCharge,
  v4Configured,
} from "./flutterwave-v4";

/**
 * Payment gateway adapters.
 *
 * Each rail has its own start / status shape, but they all end at the same
 * place: a confirmed status hands the reference to applyDepositCredit, which is
 * the only function allowed to move money into a wallet.
 *
 * Every adapter degrades to a clear error rather than throwing, so a missing
 * key shows the player a message instead of a stack trace.
 */

export type ChargeStatus = "pending" | "confirmed" | "failed";

/**
 * What the rail says became of a charge.
 *
 * The settled amount matters as much as the status. A player can start a
 * GH₵500 deposit and approve GH₵5 on the handset, and the rail will call that
 * successful — it is, it just is not the deposit that was asked for. Every
 * adapter that can report what actually arrived does, and the credit path uses
 * that figure rather than the one the player typed in.
 */
export interface ChargeOutcome {
  status: ChargeStatus;
  /** What the rail says actually settled. Absent when the rail does not say. */
  paidAmount?: number;
  paidCurrency?: string;
}

export interface StartResult {
  ok: boolean;
  /** Anything the payment row should remember, such as the rail's charge id. */
  metadata?: Record<string, unknown>;
  /** Hosted checkout URL, when the rail redirects. */
  redirectUrl?: string;
  /** True when the player must approve a prompt on their handset. */
  awaitingPrompt?: boolean;
  /** True when the rail additionally wants an OTP typed in. */
  awaitingOtp?: boolean;
  error?: string;
}

export interface GatewayAdapter {
  id: Gateway;
  label: string;
  start(opts: StartOpts): Promise<StartResult>;
  /** `meta` is the payment row's metadata, which may carry the charge id. */
  status(reference: string, meta?: Record<string, unknown>): Promise<ChargeOutcome>;
}

export interface StartOpts {
  reference: string;
  /** The player's id, where a rail can file the charge against it. */
  userId?: string;
  /**
   * The network the player picked on the deposit screen, as its label.
   *
   * Absent on a rail that never asks. The prefix is only a guess — Ghana has
   * had number portability since 2011, so a 024 that now sits on AirtelTigo is
   * ordinary, and charging it as MTN is refused by the rail.
   */
  network?: string;
  amount: number;
  currency: string;
  phone: string;
  email: string;
  name: string;
  redirectUrl: string;
}

function env(name: string): string | null {
  return process.env[name] || null;
}

// ------------------------------------------------------------ Flutterwave

/**
 * The network has to be named on a Ghana mobile-money charge, and the number's
 * prefix is the only thing we have to name it from.
 *
 * Unknown prefixes fall to MTN, which carries most of the country. Getting it
 * wrong costs a rejected charge and a clear message, not a lost payment.
 *
 * Telecel Cash is still VODAFONE to the rail, whatever the network calls itself
 * now. These are the codes a working v4 integration sends.
 */
/** What the player chose, falling back to what their prefix suggests. */
export function resolveNetwork(label: string | undefined, phone: string): "MTN" | "VODAFONE" | "AIRTELTIGO" {
  const n = (label ?? "").toLowerCase();
  if (n.includes("mtn")) return "MTN";
  if (n.includes("telecel") || n.includes("vodafone")) return "VODAFONE";
  if (n.includes("airtel") || n.includes("tigo")) return "AIRTELTIGO";
  return ghanaNetwork(phone);
}

export function ghanaNetwork(phone: string): "MTN" | "VODAFONE" | "AIRTELTIGO" {
  const digits = String(phone || "").replace(/\D/g, "");
  // Reduce to the local significant number, however it was typed.
  const local = digits.startsWith("233") ? digits.slice(3) : digits.replace(/^0+/, "");
  const prefix = local.slice(0, 2);
  if (prefix === "20" || prefix === "50") return "VODAFONE";
  if (prefix === "26" || prefix === "27" || prefix === "56" || prefix === "57") return "AIRTELTIGO";
  return "MTN";
}

/**
 * Ask v4 how a charge ended up.
 *
 * The charge id is the authoritative way to ask, so it is used whenever the
 * payment row kept one. Looking it up by our own reference is the fallback for
 * a row written before the id came back.
 */
async function v4Outcome(reference: string, meta?: Record<string, unknown>): Promise<ChargeOutcome> {
  const chargeId = typeof meta?.charge_id === "string" ? meta.charge_id : undefined;
  const charge = chargeId ? await getCharge(chargeId) : await findChargeByReference(reference);

  // A charge that is not there yet is a player still holding the prompt. That
  // is pending, not failed — failing it would strand them.
  if (!charge) return { status: "pending" };

  const s = String(charge.status ?? "").toLowerCase();
  const status: ChargeStatus = chargePaid(charge)
    ? "confirmed"
    : s === "failed" || s === "voided"
      ? "failed"
      : "pending";
  const paid = Number(charge.amount);
  return {
    status,
    paidAmount: Number.isFinite(paid) && paid > 0 ? paid : undefined,
    paidCurrency: charge.currency,
  };
}

/**
 * Ghana: a mobile-money charge the player approves on the handset.
 *
 * Three calls make one charge on v4 — the customer, the payment method, then
 * the charge itself — and the player sees none of that. They see the prompt.
 */
const flutterwaveMomo: GatewayAdapter = {
  id: "flutterwave_momo",
  label: "Mobile money",
  async start({ reference, amount, currency, phone, email, name, redirectUrl, network }) {
    if (!v4Configured()) return { ok: false, error: "Mobile money is not available right now" };

    const customer = await createCustomer({
      email: email || `${phone}@3btafric.com`,
      name,
      phone,
      dialCode: "233",
      reference,
    });
    if (!customer.ok || !customer.data?.id) {
      return { ok: false, error: customer.error ?? "Could not start the charge" };
    }

    const method = await createMobileMoneyPaymentMethod({
      countryCode: "233",
      network: resolveNetwork(network, phone),
      phone,
    });
    if (!method.ok || !method.data?.id) {
      return { ok: false, error: method.error ?? "That number was not accepted" };
    }

    const charge = await createCharge({
      reference,
      amount,
      currency,
      customerId: customer.data.id,
      paymentMethodId: method.data.id,
      // The real one, not an empty string. Mobile money normally resolves on
      // the handset, but v4 can still answer with a redirect step, and an
      // empty redirect_url leaves the player nowhere to come back to.
      redirectUrl,
    });
    if (!charge.ok || !charge.data) {
      return { ok: false, error: charge.error ?? "Could not start the charge" };
    }

    const step = charge.data.step;
    return {
      ok: true,
      metadata: { charge_id: charge.data.chargeId },
      redirectUrl: step.kind === "redirect" ? step.url : undefined,
      awaitingPrompt: step.kind !== "redirect",
    };
  },
  status: v4Outcome,
};

/**
 * Nigeria: our own checkout page, on our own domain.
 *
 * There is nothing to call at the start of this one. The player is sent to
 * /checkout, types the card there, and the routes under /api/deposits/card do
 * the talking to Flutterwave v4. All this adapter owes the rest of the app is
 * a way to ask how the charge ended up.
 */
const flutterwaveCard: GatewayAdapter = {
  id: "flutterwave_card",
  label: "Card",
  async start({ reference }) {
    if (!cardsConfigured()) return { ok: false, error: "Card payments are not available right now" };
    return { ok: true, redirectUrl: `/checkout?reference=${encodeURIComponent(reference)}` };
  },
  status: v4Outcome,
};

// -------------------------------------------------------------- Web Rabbit

const WEBRABBIT_BASE = "https://api.webrabbitmedia.com";

/**
 * Web Rabbit: Ghana mobile money.
 *
 * Written against their OpenAPI document rather than guessed. Two things in it
 * shape this adapter:
 *
 *   - There is no client reference field. Web Rabbit mints the id, so the
 *     payment row has to remember `transaction_id` and every later question is
 *     asked with that, not with our own reference.
 *   - The HTTP status carries the outcome: 201 approved outright, 202 prompt
 *     sent and waiting, 200 resolved to a final failure. A 200 here is not
 *     success, which is the one way this API will catch you out.
 *
 * Our reference goes in the Idempotency-Key, so a retried start cannot charge
 * a player twice — it replays the original response instead.
 */
const webrabbit: GatewayAdapter = {
  id: "webrabbit",
  label: "Mobile Money",
  async start({ reference, amount, phone, email, redirectUrl }) {
    const key = env("WEBRABBIT_SECRET_KEY");
    if (!key) return { ok: false, error: "Mobile money is not available right now" };

    // Their upstream rejects a reference carrying anything but letters and
    // digits -- "Reference should not contain any special characters" -- and
    // ours is BLX-XXXXXXXX-XXXXX. The hyphens failed every charge before this,
    // so the reference is flattened on the way out. Stripping is deterministic
    // and the segments keep it unique, so it still traces back to the row.
    const plainRef = reference.replace(/[^A-Za-z0-9]/g, "");

    try {
      const res = await fetch(`${WEBRABBIT_BASE}/v1/collect/momo`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": plainRef,
          // Undeclared live traffic is recorded as such; naming ourselves costs
          // nothing and keeps our calls attributable in their dashboard.
          "HTTP-Referer": new URL(redirectUrl).origin,
          "X-Webrabbitmedia-Title": "3btafric",
        },
        body: JSON.stringify({
          amount: Math.round(amount * 100) / 100,
          subscriber_number: phone,
          // Aliases are normalised on their side: VODAFONE and AIRTELTIGO are
          // accepted and echoed back as TELECEL and AT.
          network: ghanaNetwork(phone),
          desc: plainRef,
          customer_email: email || undefined,
        }),
      });

      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;

      if (res.status === 401 || res.status === 403) {
        console.error("[webrabbit] key rejected", res.status, json?.reason ?? json?.message);
        return { ok: false, error: "Deposits are being set up. Please try again shortly." };
      }
      if (res.status === 422) {
        return { ok: false, error: "That mobile money number could not be found. Check it and try again." };
      }
      if (!res.ok) {
        console.error("[webrabbit] start refused", res.status, json?.reason ?? json?.message);
        return { ok: false, error: "Could not start your payment. Please try again." };
      }

      const transactionId = json?.transaction_id ? String(json.transaction_id) : null;
      const metadata = transactionId ? { wrTransactionId: transactionId } : undefined;

      // 200 is their "resolved to a final failure", not success.
      if (res.status === 200 || json?.status === "failed") {
        const why = String(json?.reason_code ?? "");
        // The reason is the only thing that explains a refusal after the fact,
        // and the player is deliberately not shown it. Logged with their
        // transaction id so a failure can still be traced on their side, since
        // a start that fails never gets to write metadata on the payment row.
        console.error("[webrabbit] charge failed", {
          reference,
          transactionId,
          reasonCode: why,
          reason: json?.reason,
          code: json?.code,
        });
        return {
          ok: false,
          error:
            why === "insufficient_funds"
              ? "There is not enough money in that wallet."
              : why === "prompt_expired"
                ? "The approval prompt expired. Try again and approve it on your phone."
                : why === "cancelled"
                  ? "That payment was cancelled on your phone."
                  : why === "unsupported_network"
                    ? "That number is not on a supported mobile money network."
                    : "That payment did not go through. Try again.",
        };
      }

      // 201 is approved already; the status poll picks it up on its next tick.
      return { ok: true, metadata, awaitingPrompt: res.status === 202 };
    } catch (err) {
      console.error("[webrabbit] start", err);
      return { ok: false, error: "Could not start checkout" };
    }
  },

  async status(reference, meta) {
    const key = env("WEBRABBIT_SECRET_KEY");
    if (!key) return { status: "pending" };

    const id = meta?.wrTransactionId;
    // Without their id there is nothing to ask about: our own reference is
    // only an idempotency key to them, not something they can be queried by.
    if (!id) return { status: "pending" };

    try {
      const res = await fetch(`${WEBRABBIT_BASE}/v1/transactions/${encodeURIComponent(String(id))}`, {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
      });
      // Not filed yet is not failure.
      if (res.status === 404) return { status: "pending" };
      if (!res.ok) return { status: "pending" };

      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const state = String(json?.status ?? "").toLowerCase();

      if (state === "reversed") {
        // An approved charge unwound after the fact. Treated as failed so it
        // can never credit, and logged loudly because a credit may already
        // have been made against it and only a human can take that back.
        console.error("[webrabbit] charge reversed after approval", reference, id);
        return { status: "failed" };
      }

      // The player paid the gross; the fee is ours to carry, so that is the
      // figure credited rather than net_amount.
      const paid = Number(json?.gross_amount);

      return {
        status: state === "approved" ? "confirmed" : state === "failed" ? "failed" : "pending",
        paidAmount: Number.isFinite(paid) && paid > 0 ? paid : undefined,
        paidCurrency: typeof json?.currency === "string" ? json.currency : undefined,
      };
    } catch {
      return { status: "pending" };
    }
  },
};

// -------------------------------------------------------------- theTeller

function thetellerBase(): string {
  // Production unless a deployment deliberately asks for the test host, so a
  // missing variable cannot quietly point live traffic at a sandbox.
  return env("THETELLER_ENV") === "test"
    ? "https://test.theteller.net"
    : "https://prod.theteller.net";
}

/** `Authorization: Basic base64(username:apiKey)`, as their docs specify. */
function thetellerAuth(): string | null {
  const user = env("THETELLER_USERNAME");
  const key = env("THETELLER_API_KEY");
  if (!user || !key) return null;
  return Buffer.from(`${user}:${key}`, "utf8").toString("base64");
}

/**
 * A transaction id theTeller will accept: exactly 12 digits, and unique.
 *
 * Our own BLX-XXXXXXXX-XXXXX cannot be used — not the right shape, and not
 * numeric — so one is minted here and kept on the payment row, the way Web
 * Rabbit's id is. A reused id is refused outright with code 909, so this is
 * time-ordered with a random tail rather than random alone.
 */
function tellerTransactionId(): string {
  const stamp = String(Date.now()).slice(-8);
  const tail = String(Math.floor(Math.random() * 10_000)).padStart(4, "0");
  return `${stamp}${tail}`;
}

/**
 * "0241234567": the local form theTeller's own samples use.
 *
 * Our rows hold the international 233XXXXXXXXX, and a charge sent that way is
 * declined -- the same payload with a local number is approved. Handles a
 * number typed either way, since the deposit screen lets a player edit it.
 */
function localGhanaNumber(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  const local = digits.startsWith("233") ? digits.slice(3) : digits.replace(/^0+/, "");
  return `0${local.slice(-9)}`;
}

/** Their r-switch codes, from the network our own prefix check reports. */
function tellerSwitch(label: string | undefined, phone: string): "MTN" | "VDF" | "ATL" {
  const network = resolveNetwork(label, phone);
  if (network === "VODAFONE") return "VDF";
  if (network === "AIRTELTIGO") return "ATL";
  return "MTN";
}

/**
 * theTeller: Ghana mobile money.
 *
 * Their codes carry the outcome and HTTP status does not, so everything turns
 * on `code`: 000 approved, 111 the prompt is out and the customer has not
 * acted yet, and the rest are refusals. 600, 979 and 999 are configuration
 * faults — denied access, bad credentials, missing merchant id — and are kept
 * apart from a declined payment because they are the operator's problem, not
 * the player's.
 */
const theteller: GatewayAdapter = {
  id: "theteller",
  label: "Mobile Money",
  async start({ reference, amount, phone, network }) {
    const auth = thetellerAuth();
    const merchantId = env("THETELLER_MERCHANT_ID");
    if (!auth || !merchantId) return { ok: false, error: "Mobile money is not available right now" };

    const transactionId = tellerTransactionId();

    // Their process endpoint rings the handset and then holds the connection
    // open waiting for the customer, sometimes answering nothing at all --
    // measured at two minutes with zero bytes while the prompt had already
    // arrived. Left unbounded that becomes a function timeout, and the player
    // is told the payment failed while a live prompt sits on their phone.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 25_000);

    try {
      const res = await fetch(`${thetellerBase()}/v1.1/transaction/process`, {
        method: "POST",
        signal: abort.signal,
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify({
          // Pesewas, zero-padded to twelve: "000000000100" is GHS 1.
          amount: String(Math.round(amount * 100)).padStart(12, "0"),
          processing_code: "000200",
          transaction_id: transactionId,
          desc: reference.replace(/[^A-Za-z0-9]/g, ""),
          merchant_id: merchantId,
          subscriber_number: localGhanaNumber(phone),
          "r-switch": tellerSwitch(network, phone),
        }),
      });

      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const code = String(json?.code ?? "");
      const reason = String(json?.reason ?? "");

      // Keep the id whatever happens: without it a charge cannot be chased up
      // on their side, and a failed start never gets to write metadata. The
      // number and network go with it because a decline is usually about the
      // wallet, and the row otherwise records which player asked but not what
      // was actually charged.
      const metadata = {
        tellerTransactionId: transactionId,
        subscriberNumber: localGhanaNumber(phone),
        network: tellerSwitch(network, phone),
      };

      if (code === "000") return { ok: true, metadata };
      if (code === "111") return { ok: true, metadata, awaitingPrompt: true };

      if (code === "600" || code === "979" || code === "999" || code === "909") {
        console.error("[theteller] configuration refused", { reference, transactionId, code, reason });
        return { ok: false, metadata, error: "Deposits are being set up. Please try again shortly." };
      }

      console.error("[theteller] charge refused", { reference, transactionId, code, reason });
      return {
        ok: false,
        metadata,
        error:
          code === "105"
            ? "That amount was not accepted. Try a different amount."
            : // 100 is a generic decline from the network, and the common cause
              // by far is a wallet that cannot cover the amount: the debit is
              // refused outright, within seconds, without the customer ever
              // being prompted. Measured on a live wallet -- GHS 10 prompted,
              // GHS 50 and above were refused on the spot.
              "That payment was declined. Check there is enough money in that mobile money wallet, then try again.",
      };
    } catch (err) {
      // A charge that never answered still rang the phone, so this is not a
      // failure -- it is an unknown that only the status call can settle. The
      // id goes back with it and the poll takes over, which is the one path
      // that cannot credit a player twice or write off a payment they are
      // about to approve.
      console.error("[theteller] start did not answer", {
        reference,
        transactionId,
        aborted: abort.signal.aborted,
        err,
      });
      return {
        ok: true,
        metadata: { tellerTransactionId: transactionId },
        awaitingPrompt: true,
      };
    } finally {
      clearTimeout(timer);
    }
  },

  async status(reference, meta) {
    const auth = thetellerAuth();
    const merchantId = env("THETELLER_MERCHANT_ID");
    const id = meta?.tellerTransactionId;
    if (!auth || !merchantId || !id) return { status: "pending" };

    try {
      // Bounded for the same reason the charge is: their host can accept a
      // connection and then answer nothing. A poll that hangs is a poll that
      // never runs again.
      const res = await fetch(
        `${thetellerBase()}/v1.1/users/transactions/${encodeURIComponent(String(id))}/status`,
        {
          headers: {
            Authorization: `Basic ${auth}`,
            "Merchant-Id": merchantId,
            "Cache-Control": "no-cache",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!res.ok) return { status: "pending" };

      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const code = String(json?.code ?? "");
      const state = String(json?.status ?? "").toLowerCase();

      if (code === "000" || state === "approved") {
        // Not symmetrical: the charge goes out in pesewas as a padded string,
        // and the status comes back in whole cedis as a number. A GHS 1 charge
        // sent as "000000000100" reads back as 1. Dividing by a hundred here
        // would credit a player a hundredth of what they paid.
        const paid = Number(json?.amount);
        return {
          status: "confirmed",
          paidAmount: Number.isFinite(paid) && paid > 0 ? paid : undefined,
        };
      }
      // 111 is the prompt still out. Anything unrecognised is also left
      // pending: a word we do not know must never read as a refusal on a
      // charge the customer may yet approve.
      if (code === "111" || state === "pending") return { status: "pending" };

      // They reuse 999 for "Transaction not found", which is the same answer a
      // charge gives before it has been filed -- not a refusal. Reading it as
      // one would mark a payment failed while the customer is still holding
      // the prompt, and the reconcile sweep would write that down for good.
      if (/not found/i.test(String(json?.reason ?? ""))) return { status: "pending" };

      if (state === "declined" || state === "failed") return { status: "failed" };

      if (code && code !== "111") {
        console.warn("[theteller] unmapped status", { reference, id, code, state });
      }
      return { status: "pending" };
    } catch {
      return { status: "pending" };
    }
  },
};

/**
 * The manual rail: the player sends money to the displayed agent number and
 * uploads a screenshot. Nothing is automatic, so the status stays pending until
 * the operator confirms it in the console.
 */
// ------------------------------------------------------------------ Pycue

const PYCUE_BASE = "https://pycue.com/api/v1";

/** MTN / TELECEL / AIRTELTIGO, the vocabulary both Pycue and AkwaPay use.
 *  TELECEL is what Vodafone Cash became. */
function momoNetwork(label: string | undefined, phone: string): "MTN" | "TELECEL" | "AIRTELTIGO" {
  const network = resolveNetwork(label, phone);
  if (network === "VODAFONE") return "TELECEL";
  if (network === "AIRTELTIGO") return "AIRTELTIGO";
  return "MTN";
}

/**
 * Pycue: Ghana mobile money.
 *
 * Their documentation is explicit about two things that decide how this is
 * written, and both are easy to get wrong:
 *
 *   - There is no outbound webhook. Nothing is ever delivered to us, so the
 *     only way a completion is ever seen is the response to our own request
 *     or polling. A credit path waiting on a callback would never fire.
 *   - RESERVED means the outcome is unknown, not failed. Reading it as a
 *     refusal would write off a payout that is still in flight.
 *
 * clientReference is our own reference and is unique per organisation at
 * their database level, so a retried start returns the original transaction
 * rather than charging twice.
 */
const pycue: GatewayAdapter = {
  id: "pycue",
  label: "Mobile Money",
  async start({ reference, amount, phone, network, userId }) {
    const key = env("PYCUE_SECRET_KEY");
    if (!key) return { ok: false, error: "Mobile money is not available right now" };

    try {
      const res = await fetch(`${PYCUE_BASE}/deposits`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          // Decimal string in cedis, at most two places -- not pesewas.
          amount: amount.toFixed(2),
          phoneNumber: localGhanaNumber(phone),
          network: momoNetwork(network, phone),
          clientReference: reference,
          ...(userId ? { externalUserId: userId } : {}),
        }),
        signal: AbortSignal.timeout(25_000),
      });

      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const data = (json?.data ?? {}) as Record<string, unknown>;
      const txn = (data.transaction ?? data) as Record<string, unknown>;
      const id = txn?.id ? String(txn.id) : null;
      const metadata = id ? { pycueTransactionId: id } : undefined;

      if (json?.success === true && id) {
        // Their 201 is an accepted prompt, never a confirmation of funds. The
        // status poll is what decides, which is the same shape every other
        // rail here uses.
        return { ok: true, metadata, awaitingPrompt: true };
      }

      const error = (json?.error ?? {}) as Record<string, unknown>;
      const code = String(error.code ?? "");
      console.error("[pycue] deposit refused", { reference, code, message: error.message });

      if (["UNAUTHORIZED", "FORBIDDEN", "ORG_SUSPENDED", "CONFIGURATION_ERROR"].includes(code)) {
        return { ok: false, metadata, error: "Deposits are being set up. Please try again shortly." };
      }
      if (code === "PROVIDER_ERROR") {
        return { ok: false, metadata, error: "The payment service is busy. Please try again in a minute." };
      }
      return {
        ok: false,
        metadata,
        error: "That payment was declined. Check there is enough money in that mobile money wallet, then try again.",
      };
    } catch (err) {
      // A charge that never answered may still have prompted the handset, so
      // this is handed to the poll rather than called a failure.
      console.error("[pycue] deposit did not answer", { reference, err });
      return { ok: true, awaitingPrompt: true };
    }
  },

  async status(reference, meta) {
    const key = env("PYCUE_SECRET_KEY");
    const id = meta?.pycueTransactionId;
    if (!key || !id) return { status: "pending" };

    try {
      const res = await fetch(`${PYCUE_BASE}/transactions/${encodeURIComponent(String(id))}`, {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return { status: "pending" };

      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const data = (json?.data ?? {}) as Record<string, unknown>;
      const txn = (data.transaction ?? data) as Record<string, unknown>;
      const state = String(txn?.status ?? "").toUpperCase();

      if (state === "SUCCESS") {
        const paid = Number(txn?.amount);
        return {
          status: "confirmed",
          paidAmount: Number.isFinite(paid) && paid > 0 ? paid : undefined,
          paidCurrency: typeof txn?.currency === "string" ? txn.currency : undefined,
        };
      }
      if (state === "FAILED" || state === "CANCELLED") return { status: "failed" };

      // PENDING, PROCESSING and RESERVED are all "keep asking". RESERVED in
      // particular is documented as an unknown outcome, never a refusal.
      if (state && !["PENDING", "PROCESSING", "RESERVED"].includes(state)) {
        console.warn("[pycue] unmapped status", { reference, id, state });
      }
      return { status: "pending" };
    } catch {
      return { status: "pending" };
    }
  },
};

// ----------------------------------------------------------------- AkwaPay

const AKWAPAY_BASE = "https://akwapayapi.onrender.com/v1";

/**
 * AkwaPay: Ghana mobile money, two endpoints and nothing else.
 *
 * Amounts are integer pesewas in both directions, which is the opposite of
 * theTeller and the one thing here that would cost real money to get wrong.
 * GHS 1.00 is sent as 100 and reads back as 102 — they add 2% on top, so the
 * figure on the intent is the customer's debit, not what was asked for.
 * settledAmount caps at the request, so the fee cannot inflate a credit.
 *
 * Idempotency-Key carries our reference, so a retried start returns the
 * original intent rather than prompting twice.
 */
const akwapay: GatewayAdapter = {
  id: "akwapay",
  label: "Mobile Money",
  async start({ reference, amount, phone, network }) {
    const key = env("AKWAPAY_SECRET_KEY");
    if (!key) return { ok: false, error: "Mobile money is not available right now" };

    try {
      const res = await fetch(`${AKWAPAY_BASE}/payment_intents`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": reference,
        },
        body: JSON.stringify({
          // Integer pesewas. A decimal here is silently taken as pesewas too,
          // so rounding is done on our side rather than trusting theirs.
          amount: Math.round(amount * 100),
          currency: "GHS",
          method: "mobile_money",
          network: momoNetwork(network, phone),
          customer: { phone: localGhanaNumber(phone) },
          reference,
        }),
        signal: AbortSignal.timeout(25_000),
      });

      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const id = json?.id ? String(json.id) : null;

      if (res.ok && id) {
        return { ok: true, metadata: { akwapayIntentId: id }, awaitingPrompt: true };
      }

      const error = (json?.error ?? {}) as Record<string, unknown>;
      const code = String(error.code ?? "");
      console.error("[akwapay] intent refused", { reference, status: res.status, code, message: error.message });

      // They rate-limit a number that has been pushed at too often, and say
      // when it frees up. A player retrying harder only extends it.
      if (code === "number_blocked") {
        return {
          ok: false,
          error: "Too many payment attempts on that number. Wait a few minutes, then try again.",
        };
      }
      if (code === "malformed" || res.status === 401 || res.status === 403) {
        return { ok: false, error: "Deposits are being set up. Please try again shortly." };
      }
      if (code === "invalid_network") {
        return { ok: false, error: "That number is not on a supported mobile money network." };
      }
      return {
        ok: false,
        error: "That payment was declined. Check there is enough money in that mobile money wallet, then try again.",
      };
    } catch (err) {
      // The prompt may already be out, so this goes to the poll rather than
      // being called a failure.
      console.error("[akwapay] intent did not answer", { reference, err });
      return { ok: true, awaitingPrompt: true };
    }
  },

  async status(reference, meta) {
    const key = env("AKWAPAY_SECRET_KEY");
    const id = meta?.akwapayIntentId;
    if (!key || !id) return { status: "pending" };

    try {
      const res = await fetch(`${AKWAPAY_BASE}/payment_intents/${encodeURIComponent(String(id))}`, {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return { status: "pending" };

      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const state = String(json?.status ?? "").toLowerCase();

      if (state === "succeeded" || state === "success") {
        // Pesewas back to cedis. Carries their 2% on top of what was asked
        // for, which settledAmount then caps at the request.
        const minor = Number(json?.amount);
        return {
          status: "confirmed",
          paidAmount: Number.isFinite(minor) && minor > 0 ? minor / 100 : undefined,
          paidCurrency: typeof json?.currency === "string" ? json.currency : undefined,
        };
      }
      if (["failed", "canceled", "cancelled", "expired"].includes(state)) return { status: "failed" };

      // requires_action is the prompt sitting on the handset. Anything we do
      // not recognise is left pending rather than read as a refusal.
      if (state && !["requires_action", "processing", "pending"].includes(state)) {
        console.warn("[akwapay] unmapped status", { reference, id, state });
      }
      return { status: "pending" };
    } catch {
      return { status: "pending" };
    }
  },
};

// ---------------------------------------------------------------- AlphaPay

/**
 * AlphaPay (https://docs.alphapay.me), the same hosted checkout 22bet uses.
 *
 * A deposit opens a checkout session. The player picks the mobile-money
 * network on AlphaPay's page. Nothing is credited until that session is PAID.
 * sk_test_ keys use the sandbox host; sk_live_ keys use the live host.
 */
const ALPHAPAY_LIVE = "https://api.alphapay.me/api/v1";
const ALPHAPAY_SANDBOX = "https://sandbox-api.alphapay.me/api/v1";

/**
 * The secret key exactly as AlphaPay issued it. A value pasted into the host
 * dashboard often carries a trailing newline, spaces or the quotes from a
 * .env line, and AlphaPay answers any of those with "Clé API invalide".
 */
function alphapayKey(): string | null {
  const raw = env("ALPHAPAY_SECRET_KEY");
  if (!raw) return null;
  const key = raw.trim().replace(/^["']|["']$/g, "").trim();
  return key || null;
}

/**
 * A test key only works on the sandbox host and a live key only on the live
 * one; the wrong pairing is rejected as an invalid key. ALPHAPAY_API_BASE is
 * honoured only when it agrees with the key, so a live base copied from
 * .env.example cannot break a test key (or the reverse).
 */
function alphapayApiBase(): string {
  const key = alphapayKey() ?? "";
  const keyHost = key.startsWith("sk_test_") ? ALPHAPAY_SANDBOX : ALPHAPAY_LIVE;
  const forced = env("ALPHAPAY_API_BASE")?.trim().replace(/\/+$/, "");
  if (!forced) return keyHost;
  const forcedIsSandbox = /sandbox/i.test(forced);
  const keyIsTest = key.startsWith("sk_test_");
  const keyIsLive = key.startsWith("sk_live_");
  if ((keyIsTest && !forcedIsSandbox) || (keyIsLive && forcedIsSandbox)) {
    console.warn("[alphapay] ALPHAPAY_API_BASE does not match the key type; using", keyHost);
    return keyHost;
  }
  return forced;
}

/** AlphaPay takes a Ghana number the way it is dialled locally: 0241234567. */
function alphapayPhone(phone: string, currency: string): string {
  const digits = phone.replace(/\D/g, "");
  if (String(currency).toUpperCase() === "GHS" && digits.length >= 9) {
    return `0${digits.slice(-9)}`;
  }
  return digits;
}

function pushAlphapayText(parts: string[], value: unknown) {
  if (typeof value === "string" && value.trim()) parts.push(value.trim());
  else if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim()) parts.push(item.trim());
    }
  }
}

/** Drop anything that could be a secret before a message is shown to a player. */
function publicAlphapayMessage(raw: string): string {
  const stripped = raw
    .replace(/sk_(?:live|test)_[A-Za-z0-9_-]+/gi, "")
    .replace(/bearer\s+\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return "AlphaPay rejected this checkout";
  return stripped.slice(0, 240);
}

function alphapayErrorMessage(json: unknown, status: number): string {
  const fallback = status ? `AlphaPay rejected this checkout (HTTP ${status})` : "Could not start checkout";
  if (!json || typeof json !== "object") return fallback;
  const body = json as Record<string, unknown>;
  const parts: string[] = [];
  const err = body.error;
  if (typeof err === "string") pushAlphapayText(parts, err);
  else if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    pushAlphapayText(parts, record.message);
    pushAlphapayText(parts, record.detail);
    for (const [field, value] of Object.entries(record)) {
      if (field === "message" || field === "code" || field === "detail") continue;
      if (typeof value === "string" && value.trim()) parts.push(`${field}: ${value.trim()}`);
      else if (Array.isArray(value)) {
        const texts = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
        if (texts.length) parts.push(`${field}: ${texts.join(" ")}`);
      }
    }
  }
  pushAlphapayText(parts, body.message);
  if (typeof body.detail === "string") pushAlphapayText(parts, body.detail);
  const joined = [...new Set(parts)].join(" ");
  return joined ? publicAlphapayMessage(joined) : fallback;
}

async function alphapayRequest(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const key = alphapayKey();
  if (!key) return { ok: false, error: "Mobile money is not available right now" };
  // Payout routes are the only AlphaPay calls that must leave via the static
  // proxy. Checkout, status, and the webhook stay on a direct connection.
  if (isAlphapayPayoutPath(path)) return alphapayPayoutCall(path, init, key);
  try {
    const res = await fetch(`${alphapayApiBase()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    return alphapayCallResult(path, res);
  } catch (err) {
    console.error("[alphapay]", path, err);
    return { ok: false, error: "Could not reach AlphaPay. Try again." };
  }
}

/**
 * Send one AlphaPay payout request through ALPHAPAY_PAYOUT_PROXY_URL.
 * A missing proxy is a failure: calling AlphaPay directly would use Vercel's
 * changing address, which the payout whitelist rejects.
 */
async function alphapayPayoutCall(
  path: string,
  init: RequestInit | undefined,
  key: string,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const sent = await alphapayPayoutFetch(`${alphapayApiBase()}${path}`, {
      method: init?.method,
      headers: alphapayPayoutHeaders(key, init),
      body: alphapayPayoutBody(init?.body),
      signal: AbortSignal.timeout(25_000),
    });
    if ("error" in sent) return { ok: false, error: sent.error };
    return alphapayCallResult(path, sent.response);
  } catch (err) {
    console.error("[alphapay] payout", path, payoutErrorText(err));
    return { ok: false, error: "Could not reach AlphaPay. Try again." };
  }
}

function alphapayPayoutHeaders(key: string, init?: RequestInit): Record<string, string> {
  const extra: Record<string, string> = {};
  const raw = init?.headers;
  if (raw instanceof Headers) {
    raw.forEach((value, name) => {
      extra[name] = value;
    });
  } else if (Array.isArray(raw)) {
    for (const [name, value] of raw) extra[name] = value;
  } else if (raw) {
    for (const [name, value] of Object.entries(raw)) {
      if (typeof value === "string") extra[name] = value;
    }
  }
  delete extra.authorization;
  delete extra.Authorization;
  return {
    Accept: "application/json",
    ...extra,
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
    Authorization: `Bearer ${key}`,
  };
}

/** Payout bodies are JSON. Anything else is dropped rather than sent raw. */
function alphapayPayoutBody(body: BodyInit | null | undefined): string | undefined {
  return typeof body === "string" ? body : undefined;
}

/** Drop proxy credentials before a transport error is written to the logs. */
function payoutErrorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/\/\/[^\s/@]+(?::[^\s/@]*)?@/g, "//").slice(0, 240);
}

async function alphapayCallResult(
  path: string,
  res: { ok: boolean; status: number; json: () => Promise<unknown> },
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const data = ((json && typeof json === "object" && "data" in json ? json.data : json) ??
    {}) as Record<string, unknown>;
  if (!res.ok || json?.success === false) {
    const message = alphapayErrorMessage(json, res.status);
    console.error("[alphapay]", path, res.status, message);
    // A rejected key or an unauthorised caller is ours to fix, not the
    // player's. They get a plain message; the real one is in the logs.
    if (res.status === 401 || res.status === 403 || /cl[ée]\s*api|api\s*key|invalid\s*key/i.test(message)) {
      return { ok: false, error: "Deposits are being set up. Please try again shortly." };
    }
    return { ok: false, error: message };
  }
  return { ok: true, data };
}

/** One authenticated AlphaPay read. Null when the call does not succeed. */
export async function alphapayRead(path: string): Promise<Record<string, unknown> | null> {
  const found = await alphapayRequest(path);
  return found.ok ? found.data : null;
}

const alphapay: GatewayAdapter = {
  id: "alphapay",
  label: "Mobile Money",
  async start({ reference, amount, currency, phone, email, name, redirectUrl }) {
    let origin: string;
    try {
      origin = new URL(redirectUrl).origin;
    } catch {
      return { ok: false, error: "Mobile money is not available right now" };
    }

    const country =
      currency.toUpperCase() === "GHS" ? "GH" : currency.toUpperCase() === "NGN" ? "NG" : undefined;
    const host = new URL(origin).hostname;
    const created = await alphapayRequest("/checkout-sessions/", {
      method: "POST",
      body: JSON.stringify({
        amount: amount.toFixed(2),
        currency: currency.toUpperCase(),
        description: `Deposit ${reference}`,
        ...(country ? { country } : {}),
        customer_email: email || `deposit+${reference.toLowerCase()}@${host}`,
        customer_name: name || "Player",
        customer_phone: alphapayPhone(phone, currency),
        return_url: redirectUrl,
        metadata: { reference },
      }),
    });
    if (!created.ok) return { ok: false, error: created.error };

    const checkout = alphapaySessionUrl(created.data.checkout_url);
    if (!checkout) return { ok: false, error: "Could not open the payment page" };

    const id = created.data.id == null ? undefined : String(created.data.id);
    return {
      ok: true,
      redirectUrl: checkout,
      metadata: {
        alphapay_session_id: id,
        alphapay_id: id,
        checkout_url: checkout,
      },
    };
  },

  async status(reference, meta) {
    const id = typeof meta?.alphapay_session_id === "string" ? meta.alphapay_session_id : "";
    if (!id) return { status: "pending" };

    const found = await alphapayRequest(`/checkout-sessions/${encodeURIComponent(id)}/status/`);
    if (!found.ok) return { status: "pending" };

    const session = String(found.data.status ?? "").toUpperCase();
    const transaction = String(found.data.transaction_status ?? "").toUpperCase();
    const status: ChargeStatus =
      session === "PAID" || transaction === "SUCCESS"
        ? "confirmed"
        : ["CANCELLED", "CANCELED", "EXPIRED", "FAILED"].includes(session) ||
            transaction === "FAILED" ||
            transaction === "CANCELLED"
          ? "failed"
          : "pending";
    if (status === "pending" && session && !["PENDING", "PROCESSING"].includes(session)) {
      console.warn("[alphapay] unmapped status", { reference, id, session, transaction });
    }
    const raw = Number(found.data.amount);
    return {
      status,
      paidAmount: Number.isFinite(raw) && raw > 0 ? raw : undefined,
      paidCurrency: typeof found.data.currency === "string" ? found.data.currency : undefined,
    };
  },
};

const manual: GatewayAdapter = {
  id: "manual",
  label: "Mobile money transfer",
  async start() {
    return { ok: true };
  },
  async status(): Promise<ChargeOutcome> {
    return { status: "pending" };
  },
};

const ADAPTERS: Record<Gateway, GatewayAdapter> = {
  flutterwave_momo: flutterwaveMomo,
  flutterwave_card: flutterwaveCard,
  webrabbit,
  theteller,
  pycue,
  akwapay,
  alphapay,
  manual,
};

/**
 * What a confirmed charge is actually worth.
 *
 * The rail's own figure wins whenever it gives one in the currency the deposit
 * was opened in. Everything else — a rail that reports nothing, a figure that
 * arrives in another currency — falls back to what the player asked for, which
 * is the best guess available and the behaviour that stood before.
 */
export function settledAmount(outcome: ChargeOutcome, requested: number, currency: string): number {
  const paid = outcome.paidAmount;
  if (!paid || !Number.isFinite(paid) || paid <= 0) return requested;
  if (outcome.paidCurrency && outcome.paidCurrency.toUpperCase() !== String(currency).toUpperCase()) {
    return requested;
  }
  // Never more than was asked for. A rail reporting above the request is
  // reporting the customer's debit with its own fee on top -- theTeller
  // answers 1.02 on a GHS 1 charge -- and that fee is the cost of collection,
  // not money that arrived for the player. Crediting it would hand out a few
  // pesewas of the operator's money on every single deposit.
  return Math.min(paid, requested);
}

export function adapterFor(gateway: Gateway): GatewayAdapter {
  return ADAPTERS[gateway] ?? manual;
}

export function allAdapters(): GatewayAdapter[] {
  return Object.values(ADAPTERS);
}
