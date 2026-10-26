/**
 * Flutterwave v4, which is now the only rail we talk to.
 *
 * v4 is a different animal from v3: it authenticates with OAuth client
 * credentials rather than a standing secret key, and every payment is three
 * calls — a customer, a payment method, then the charge that joins them. Cards
 * are encrypted before they leave us; mobile money is not, because there is
 * nothing secret in a network name and a phone number.
 *
 * Nothing here knows about deposits. `gateways.ts` puts these calls behind the
 * same adapter shape every other rail uses.
 */
import { createCipheriv, randomBytes, randomUUID } from "crypto";

const IDP = "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token";
const SANDBOX = "https://developersandbox-api.flutterwave.com";
const LIVE = "https://f4bexperience.flutterwave.com";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

/**
 * The OAuth pair is read under either name.
 *
 * `FLUTTERWAVE_V4_*` is what the dashboard and our other deployments call it;
 * the shorter form was used here first. Accepting both means a deployment that
 * set one of them does not go dark when the other is the one being asked for.
 */
function credential(kind: "CLIENT_ID" | "CLIENT_SECRET"): string | undefined {
  return env(`FLUTTERWAVE_V4_${kind}`) ?? env(`FLUTTERWAVE_${kind}`);
}

function baseUrl(): string {
  const override = env("FLUTTERWAVE_V4_BASE_URL");
  if (override) return override.replace(/\/+$/, "");
  // Live unless a deployment deliberately asks for the sandbox. A missing
  // variable should not quietly point production at a test rail.
  return env("FLUTTERWAVE_ENV") === "sandbox" ? SANDBOX : LIVE;
}

/** True when the deployment can authenticate against v4 at all. */
export function v4Configured(): boolean {
  return Boolean(credential("CLIENT_ID") && credential("CLIENT_SECRET"));
}

/** Cards need one thing more: the key their details are sealed with. */
export function cardsConfigured(): boolean {
  return v4Configured() && Boolean(env("FLUTTERWAVE_ENCRYPTION_KEY"));
}

// ------------------------------------------------------------------- auth

/**
 * Access tokens live ten minutes. One is cached and reused, and retired a
 * minute early so a call never sets off with a token that expires mid-flight.
 */
let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string | null> {
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const clientId = credential("CLIENT_ID");
  const clientSecret = credential("CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch(IDP, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      }),
    });
    const json = await res.json();
    if (!res.ok || !json?.access_token) {
      console.error("[flw4] token request failed", res.status, json?.error_description ?? json?.error);
      return null;
    }
    const ttl = Number(json.expires_in) || 600;
    cached = { token: String(json.access_token), expiresAt: Date.now() + (ttl - 60) * 1000 };
    return cached.token;
  } catch (err) {
    console.error("[flw4] token request threw", err);
    return null;
  }
}

interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function api<T>(
  path: string,
  init: { method: "GET" | "POST" | "PUT"; body?: unknown; idempotencyKey?: string } = { method: "GET" },
): Promise<ApiResult<T>> {
  const token = await accessToken();
  if (!token) return { ok: false, error: "Payments are not available right now" };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    // v4 requires a trace id of 12 characters or more, unique per request.
    "X-Trace-Id": `3btafric-${randomUUID()}`,
  };
  // Every write carries an idempotency key: a retried request must not become
  // a second charge.
  if (init.method !== "GET") headers["X-Idempotency-Key"] = init.idempotencyKey ?? randomUUID();

  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);

    // v4 can answer 200 with a failure in the envelope, so the body decides
    // as much as the HTTP code does.
    if (!res.ok || (json?.status && json.status !== "success")) {
      const message =
        json?.error?.validation_errors?.[0]?.message ??
        json?.error?.message ??
        json?.message ??
        `Request failed (${res.status})`;
      console.error("[flw4]", init.method, path, res.status, message, "base:", baseUrl());

      // A rejected credential is never the player's fault and never their
      // problem to read. "Forbidden" belongs in the log, not on the screen.
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: "Payments are not available right now" };
      }
      return { ok: false, error: String(message) };
    }
    return { ok: true, data: (json?.data ?? json) as T };
  } catch (err) {
    console.error("[flw4]", init.method, path, "threw", err);
    return { ok: false, error: "Could not reach the payment processor" };
  }
}

// ------------------------------------------------------------- encryption

const NONCE_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** A fresh 12-character nonce, which is the length v4 accepts and no other. */
export function encryptionNonce(): string {
  const bytes = randomBytes(12);
  let out = "";
  for (const b of bytes) out += NONCE_ALPHABET[b % NONCE_ALPHABET.length];
  return out;
}

/**
 * AES-256-GCM, base64 key in and base64 ciphertext out with the GCM tag
 * appended. Each field is encrypted on its own under the same nonce.
 */
export function encryptField(value: string, nonce: string): string {
  const raw = env("FLUTTERWAVE_ENCRYPTION_KEY");
  if (!raw) throw new Error("FLUTTERWAVE_ENCRYPTION_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("FLUTTERWAVE_ENCRYPTION_KEY must be a base64-encoded 32-byte key");

  const cipher = createCipheriv("aes-256-gcm", key, Buffer.from(nonce, "utf8"));
  const body = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return Buffer.concat([body, cipher.getAuthTag()]).toString("base64");
}

// -------------------------------------------------------------- customers

/**
 * v4 refuses a customer whose email it has seen before, and offers no lookup to
 * find the one it already has. So every charge gets its own address by
 * plus-addressing the player's: it routes to the same inbox and never collides.
 */
function uniqueEmail(email: string, reference: string): string {
  const tag = reference.replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
  const at = email.indexOf("@");
  if (at > 0) return `${email.slice(0, at)}+${tag}@${email.slice(at + 1)}`;
  return `deposit-${tag}@3btafric.com`;
}

export async function createCustomer(opts: {
  email: string;
  name: string;
  phone: string;
  dialCode: string;
  reference: string;
}): Promise<ApiResult<{ id: string }>> {
  const [first, ...rest] = opts.name.trim().split(/\s+/);
  const digits = opts.phone.replace(/\D/g, "");
  const local = digits.startsWith(opts.dialCode) ? digits.slice(opts.dialCode.length) : digits.replace(/^0+/, "");

  return api<{ id: string }>("/customers", {
    method: "POST",
    body: {
      email: uniqueEmail(opts.email, opts.reference),
      name: { first: first || "Player", last: rest.join(" ") || first || "Player" },
      phone: { country_code: opts.dialCode, number: local },
    },
  });
}

// --------------------------------------------------------- payment methods

export interface CardInput {
  number: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
}

export async function createCardPaymentMethod(card: CardInput): Promise<ApiResult<{ id: string }>> {
  const nonce = encryptionNonce();
  return api<{ id: string }>("/payment-methods", {
    method: "POST",
    body: {
      type: "card",
      card: {
        encrypted_card_number: encryptField(card.number.replace(/\D/g, ""), nonce),
        encrypted_expiry_month: encryptField(card.expiryMonth, nonce),
        encrypted_expiry_year: encryptField(card.expiryYear, nonce),
        encrypted_cvv: encryptField(card.cvv, nonce),
        nonce,
      },
    },
  });
}

/**
 * Mobile money asks for nothing encrypted: the network and the number are the
 * whole of it, and the player approves the charge on the handset.
 */
export async function createMobileMoneyPaymentMethod(opts: {
  countryCode: string;
  network: string;
  phone: string;
}): Promise<ApiResult<{ id: string }>> {
  const digits = opts.phone.replace(/\D/g, "");
  const local = digits.startsWith(opts.countryCode) ? digits.slice(opts.countryCode.length) : digits.replace(/^0+/, "");

  return api<{ id: string }>("/payment-methods", {
    method: "POST",
    body: {
      type: "mobile_money",
      mobile_money: {
        country_code: opts.countryCode,
        network: opts.network,
        phone_number: local,
      },
    },
  });
}

// ---------------------------------------------------------------- charges

/** What the player has to do next, flattened out of v4's `next_action`. */
export type ChargeStep =
  | { kind: "done" }
  | { kind: "failed" }
  | { kind: "pending" }
  | { kind: "prompt"; note?: string }
  | { kind: "redirect"; url: string }
  | { kind: "pin" }
  | { kind: "otp" }
  | { kind: "avs"; fields: string[] };

export interface ChargeState {
  chargeId: string;
  step: ChargeStep;
}

export interface RawCharge {
  id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  reference?: string;
  processor_response?: { type?: string; code?: string };
  next_action?: {
    type?: string;
    redirect_url?: { url?: string };
    payment_instruction?: { note?: string };
    requires_additional_fields?: { fields?: string[] };
  };
}

/** Read a charge's own words about where it is. */
/** True only when the charge is actually paid. */
export function chargePaid(charge: RawCharge | undefined): boolean {
  return String(charge?.status ?? "").toLowerCase() === "succeeded" || charge?.processor_response?.code === "00";
}

export function readStep(charge: RawCharge | undefined): ChargeStep {
  const status = String(charge?.status ?? "").toLowerCase();
  if (chargePaid(charge)) return { kind: "done" };
  if (status === "failed" || status === "voided") return { kind: "failed" };

  const action = charge?.next_action;
  switch (action?.type) {
    case "redirect_url": {
      const url = action.redirect_url?.url;
      return url ? { kind: "redirect", url } : { kind: "pending" };
    }
    case "payment_instruction":
      return { kind: "prompt", note: action.payment_instruction?.note };
    case "requires_pin":
      return { kind: "pin" };
    case "requires_otp":
      return { kind: "otp" };
    case "requires_additional_fields":
      return { kind: "avs", fields: action.requires_additional_fields?.fields ?? [] };
    default:
      return { kind: "pending" };
  }
}

export async function createCharge(opts: {
  reference: string;
  amount: number;
  currency: string;
  customerId: string;
  paymentMethodId: string;
  redirectUrl: string;
}): Promise<ApiResult<ChargeState>> {
  const res = await api<RawCharge>("/charges", {
    method: "POST",
    // Our reference is unique per deposit, so it doubles as the idempotency
    // key: one deposit can never become two charges.
    idempotencyKey: opts.reference,
    body: {
      reference: opts.reference,
      amount: opts.amount,
      currency: opts.currency,
      customer_id: opts.customerId,
      payment_method_id: opts.paymentMethodId,
      redirect_url: opts.redirectUrl,
    },
  });

  if (!res.ok || !res.data?.id) return { ok: false, error: res.error ?? "Could not start the charge" };
  return { ok: true, data: { chargeId: String(res.data.id), step: readStep(res.data) } };
}

export type Authorization =
  | { type: "pin"; pin: string }
  | { type: "otp"; code: string }
  | { type: "avs"; address: Record<string, string> };

export async function authorizeCharge(chargeId: string, auth: Authorization): Promise<ApiResult<ChargeState>> {
  let body: Record<string, unknown>;
  if (auth.type === "pin") {
    const nonce = encryptionNonce();
    body = { authorization: { type: "pin", pin: { nonce, encrypted_pin: encryptField(auth.pin, nonce) } } };
  } else if (auth.type === "otp") {
    body = { authorization: { type: "otp", otp: { code: auth.code } } };
  } else {
    body = { authorization: { type: "avs", avs: { address: auth.address } } };
  }

  const res = await api<RawCharge>(`/charges/${encodeURIComponent(chargeId)}`, { method: "PUT", body });
  if (!res.ok) return { ok: false, error: res.error ?? "That did not go through" };
  return { ok: true, data: { chargeId, step: readStep(res.data) } };
}

export async function getCharge(chargeId: string): Promise<RawCharge | undefined> {
  const res = await api<RawCharge>(`/charges/${encodeURIComponent(chargeId)}`, { method: "GET" });
  return res.ok ? res.data : undefined;
}

/** Find a charge by the reference we gave it, for when the id was not kept. */
export async function findChargeByReference(reference: string): Promise<RawCharge | undefined> {
  const res = await api<RawCharge[] | { data?: RawCharge[] }>(
    `/charges?reference=${encodeURIComponent(reference)}&size=1`,
    { method: "GET" },
  );
  if (!res.ok) return undefined;
  const list = Array.isArray(res.data) ? res.data : (res.data as { data?: RawCharge[] })?.data;
  return list?.[0];
}
