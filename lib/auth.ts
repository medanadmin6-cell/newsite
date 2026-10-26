import { createHash, createHmac, timingSafeEqual, randomBytes } from "crypto";

/**
 * Three separate identity models, exactly as the platform runs today.
 *
 *  - Players have no server session. The signed-in player's id is kept in
 *    browser local storage and passed to the API on each call. This is a known
 *    weakness and is documented in the README as the first thing to replace.
 *  - The operator shares one password held in ADMIN_PASSWORD.
 *  - Partners get a signed cookie tied to their id and password hash, so
 *    changing a partner's password invalidates their sessions.
 */

export const ADMIN_COOKIE = "betlixx_admin";
export const PARTNER_COOKIE = "betlixx_partner";
const ADMIN_TTL_HOURS = 12;

function secret(): string {
  return process.env.ADMIN_PASSWORD || "";
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Constant-time compare that does not leak length through an early return. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(sha256(a), "hex");
  const bb = Buffer.from(sha256(b), "hex");
  return timingSafeEqual(ab, bb);
}

// ---------------------------------------------------------------- operator

export function adminEnabled(): boolean {
  return secret().length > 0;
}

export function adminToken(): string {
  return sha256(`betlixx-admin:${secret()}`);
}

export function checkAdminPassword(candidate: string): boolean {
  if (!adminEnabled()) return false;
  return safeEqual(candidate, secret());
}

/** Validate an admin cookie value. Used by middleware and by every admin route. */
export function isValidAdminToken(value: string | undefined): boolean {
  if (!adminEnabled() || !value) return false;
  return safeEqual(value, adminToken());
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_TTL_HOURS * 3600,
  };
}

// ----------------------------------------------------------------- partner

/**
 * Signed partner session: id, plus an HMAC over the id and the current password
 * hash. Rotating the password changes the hash and so invalidates every
 * outstanding cookie.
 */
export function signPartner(id: string, passwordHash: string): string {
  const mac = createHmac("sha256", secret() || "betlixx")
    .update(`${id}:${passwordHash}`)
    .digest("hex");
  return `${id}.${mac}`;
}

export function verifyPartner(cookieValue: string | undefined, passwordHash: string): string | null {
  if (!cookieValue) return null;
  const [id, mac] = cookieValue.split(".");
  if (!id || !mac) return null;
  const expected = createHmac("sha256", secret() || "betlixx")
    .update(`${id}:${passwordHash}`)
    .digest("hex");
  try {
    if (!timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(expected, "hex"))) return null;
  } catch {
    return null;
  }
  return id;
}

/** Partner id from the cookie, without verification — for looking up the hash. */
export function partnerIdFromCookie(cookieValue: string | undefined): string | null {
  if (!cookieValue) return null;
  const [id] = cookieValue.split(".");
  return id || null;
}

export function partnerCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 3600,
  };
}

// ------------------------------------------------------------------- misc

export function referralCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}
