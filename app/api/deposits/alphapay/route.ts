import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/supabase";
import { adapterFor, alphapayRead, settledAmount } from "@/lib/gateways";
import { applyDepositCredit } from "@/lib/money";

export const dynamic = "force-dynamic";

/**
 * AlphaPay webhook and browser return, at /api/deposits/alphapay.
 *
 * POST is the signed webhook (transaction.success and the failure events).
 * The body is not trusted for the amount: after the signature check we find
 * our deposit and ask AlphaPay for the checkout session, then credit once.
 * GET is only the player's browser, if a return ever lands here.
 */

const SUCCESS_EVENTS = new Set(["transaction.success", "payment.succeeded"]);
const FAILURE_EVENTS = new Set([
  "transaction.failed",
  "transaction.cancelled",
  "payment.failed",
  "payment.cancelled",
]);

/** The customer coming back. Settle what can be settled, then show the account. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const reference = url.searchParams.get("reference");
  if (reference) await settle(reference);
  return NextResponse.redirect(new URL("/account", url.origin));
}

/** The signed webhook. */
export async function POST(req: Request) {
  const raw = await req.text();

  if (
    !signed(
      raw,
      req.headers.get("x-webhook-signature") ?? req.headers.get("x-alphapay-signature"),
      req.headers.get("x-webhook-timestamp"),
    )
  ) {
    console.warn("[alphapay] rejected a webhook with a bad signature");
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let event: { event?: unknown; data?: Record<string, unknown> };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const name = eventName(event.event, req.headers.get("x-webhook-event"));
  if (name === "webhook.test") return NextResponse.json({ ok: true });
  if (!SUCCESS_EVENTS.has(name) && !FAILURE_EVENTS.has(name)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const supabase = db();
  if (!supabase) return NextResponse.json({ ok: false }, { status: 503 });

  const reference = await depositReference(event.data ?? {}, supabase);
  if (!reference) {
    console.warn("[alphapay] webhook had no deposit reference", name);
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const done = await settle(reference);
  if (!done) return NextResponse.json({ ok: false }, { status: 503 });
  return NextResponse.json({ ok: true });
}

/**
 * AlphaPay signs `${timestamp}.${raw body}` with the webhook secret.
 * X-Webhook-Signature is the lowercase hex digest. A stamp older than five
 * minutes is rejected, the same window their docs and Betzone use.
 */
function signed(raw: string, header: string | null, timestamp: string | null): boolean {
  const key = process.env.ALPHAPAY_WEBHOOK_SECRET || process.env.ALPHAPAY_SECRET_KEY;
  if (!key || !header || !timestamp) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const expected = createHmac("sha256", key).update(`${timestamp}.${raw}`).digest("hex");
  const given = Buffer.from(header.trim().toLowerCase().replace(/^sha256=/, ""));
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

function eventName(body: unknown, header: string | null): string {
  const value = typeof body === "string" && body ? body : header;
  return (value ?? "").trim().toLowerCase();
}

function referenceFromMetadata(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const reference = (value as { reference?: unknown }).reference;
  return typeof reference === "string" ? reference.trim() : "";
}

/** Our references are written into the checkout description as `Deposit BLX-...`. */
function referenceFromDescription(value: unknown): string {
  if (typeof value !== "string") return "";
  const match = value.match(/^Deposit\s+(BLX-[A-Z0-9]+-[A-Z0-9]+)\b/);
  return match?.[1] ?? "";
}

function transactionIdOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return "";
}

type Payments = NonNullable<ReturnType<typeof db>>;

/**
 * AlphaPay's webhook `data.reference` is their TXN id, not ours. Ours is the
 * checkout metadata, the `Deposit BLX-...` description, or a pending session
 * whose transaction id matches.
 */
async function depositReference(data: Record<string, unknown>, supabase: Payments): Promise<string> {
  const echoed = referenceFromMetadata(data.metadata);
  if (echoed) return echoed;

  const theirs = typeof data.reference === "string" ? data.reference : "";
  if (theirs) {
    const { data: row } = await supabase
      .from("payments")
      .select("reference")
      .eq("reference", theirs)
      .eq("provider", "alphapay")
      .maybeSingle();
    if (row?.reference) return row.reference;
  }

  const txnId = typeof data.id === "string" ? data.id : "";
  if (txnId) {
    const transaction = await alphapayRead(`/transactions/${encodeURIComponent(txnId)}/`);
    const fromTransaction =
      referenceFromMetadata(transaction?.metadata) || referenceFromDescription(transaction?.description);
    if (fromTransaction) return fromTransaction;
  }

  const page = await alphapayRead("/checkout-sessions/?status=PAID&page_size=20");
  const results = Array.isArray(page?.results) ? page.results : [];
  for (const item of results) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const txn = transactionIdOf(row.transaction);
    const txnRef = typeof row.transaction_reference === "string" ? row.transaction_reference : "";
    if ((txnId && txn === txnId) || (theirs && txnRef === theirs)) {
      const reference = referenceFromMetadata(row.metadata) || referenceFromDescription(row.description);
      if (reference) return reference;
    }
  }

  return "";
}

/**
 * Ask AlphaPay how the charge ended up and act on the answer. Crediting is
 * idempotent, so the browser, the webhook and the poll can all arrive at once.
 * False means the status call failed or is not final yet, so the webhook
 * should be retried.
 */
async function settle(reference: string): Promise<boolean> {
  const supabase = db();
  if (!supabase) return false;

  const { data: payment } = await supabase
    .from("payments")
    .select("reference, user_id, amount, currency, provider, status, metadata")
    .eq("reference", reference)
    .maybeSingle();

  if (!payment || payment.provider !== "alphapay") return true;
  if (payment.status !== "pending") return true;

  try {
    const outcome = await adapterFor("alphapay").status(
      reference,
      (payment.metadata ?? undefined) as Record<string, unknown> | undefined,
    );

    if (outcome.status === "confirmed") {
      const credit = await applyDepositCredit({
        userId: payment.user_id,
        amount: settledAmount(outcome, Number(payment.amount), payment.currency),
        currency: payment.currency,
        reference,
        provider: payment.provider,
      });
      // A duplicate is the credit already landed. Anything else must be retried,
      // or AlphaPay would treat a 200 as delivered and the wallet would stay empty.
      return credit.credited || credit.duplicate === true;
    }
    if (outcome.status === "failed") {
      await supabase
        .from("payments")
        .update({ status: "failed", resolved_at: new Date().toISOString() })
        .eq("reference", reference)
        .eq("status", "pending");
      return true;
    }
    return false;
  } catch (err) {
    console.error("[alphapay] could not settle from the callback", reference, err);
    return false;
  }
}
