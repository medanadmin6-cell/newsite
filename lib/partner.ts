import { cookies } from "next/headers";
import { db } from "./supabase";
import { PARTNER_COOKIE, partnerIdFromCookie, verifyPartner } from "./auth";

/**
 * The signed-in partner, and the bridge to their betting account.
 *
 * A partner has two identities that coexist: the dashboard session (a signed
 * cookie) and, optionally, a player session (an id in browser storage). Neither
 * clears the other, which is what lets a partner bet and then return to the
 * dashboard without signing in again.
 */

export interface PartnerRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  referral_code: string;
  approved: boolean;
  balances: Record<string, number>;
  lifetime: Record<string, number>;
  payout_name: string | null;
  payout_network: string | null;
  payout_number: string | null;
  user_id: string | null;
  password_hash: string;
}

const COLUMNS =
  "id, name, email, phone, referral_code, approved, balances, lifetime, payout_name, payout_network, payout_number, user_id, password_hash";

/** Resolve the partner from their signed cookie, or null. */
export async function currentPartner(): Promise<PartnerRow | null> {
  const supabase = db();
  if (!supabase) return null;

  const jar = await cookies();
  const cookieValue = jar.get(PARTNER_COOKIE)?.value;
  const id = partnerIdFromCookie(cookieValue);
  if (!id) return null;

  const { data } = await supabase.from("sub_admins").select(COLUMNS).eq("id", id).maybeSingle();
  if (!data) return null;

  const partner = data as unknown as PartnerRow;

  // The signature covers the current password hash, so rotating the password
  // invalidates every outstanding cookie.
  if (!verifyPartner(cookieValue, partner.password_hash)) return null;

  return partner;
}

function samePhone(a: string | null | undefined, b: string | null | undefined) {
  const left = (a ?? "").replace(/\D/g, "");
  const right = (b ?? "").replace(/\D/g, "");
  if (left.length < 9 || right.length < 9) return false;
  return left === right || left.endsWith(right.slice(-9)) || right.endsWith(left.slice(-9));
}

/**
 * The sub-admin row for this betting account.
 *
 * The link is usually sub_admins.user_id. A partner who already had a player
 * login is matched by email or phone and linked, so withdraw can see them.
 */
export async function linkedSubAdmin(user: {
  id: string;
  email?: string | null;
  phone?: string | null;
}): Promise<{ id: string; approved: boolean } | null> {
  const supabase = db();
  if (!supabase) return null;

  const { data: byUser } = await supabase
    .from("sub_admins")
    .select("id, approved")
    .eq("user_id", user.id)
    .maybeSingle();
  if (byUser) return { id: byUser.id, approved: Boolean(byUser.approved) };

  const email = user.email?.trim().toLowerCase();
  if (email) {
    // Exact match misses when the partner row and the player row differ only
    // by letter case, which left an approved sub-admin on the ordinary gate.
    const { data: emailRows } = await supabase.from("sub_admins").select("id, user_id, email, approved");
    const byEmail = (emailRows ?? []).find(
      (row) => row.email?.trim().toLowerCase() === email && (!row.user_id || row.user_id === user.id),
    );
    if (byEmail) {
      if (!byEmail.user_id) {
        await supabase.from("sub_admins").update({ user_id: user.id }).eq("id", byEmail.id);
      }
      return { id: byEmail.id, approved: Boolean(byEmail.approved) };
    }
  }

  if (user.phone) {
    const { data: rows } = await supabase.from("sub_admins").select("id, user_id, phone, approved");
    const byPhone = (rows ?? []).find(
      (row) => (!row.user_id || row.user_id === user.id) && samePhone(row.phone, user.phone),
    );
    if (byPhone) {
      if (!byPhone.user_id) {
        await supabase.from("sub_admins").update({ user_id: user.id }).eq("id", byPhone.id);
      }
      return { id: byPhone.id, approved: Boolean(byPhone.approved) };
    }
  }

  const cookiePartner = await currentPartner();
  if (!cookiePartner || (cookiePartner.user_id && cookiePartner.user_id !== user.id)) return null;
  if (
    cookiePartner.user_id === user.id ||
    (email && cookiePartner.email.trim().toLowerCase() === email) ||
    samePhone(cookiePartner.phone, user.phone)
  ) {
    if (!cookiePartner.user_id) {
      await supabase.from("sub_admins").update({ user_id: user.id }).eq("id", cookiePartner.id);
    }
    return { id: cookiePartner.id, approved: Boolean(cookiePartner.approved) };
  }

  return null;
}

/** Strip the hash before anything is returned to a client. */
export function publicPartner(p: PartnerRow) {
  const { password_hash: _hash, ...safe } = p;
  void _hash;
  return safe;
}

/**
 * Caps on a partner crediting their own wallet.
 * A blank or zero setting is not a cap of nothing: Number("") is 0, and that
 * rejects every credit with "the most you can credit at once is 0".
 */
export function partnerCreditLimits() {
  return {
    perCredit: positiveLimit(process.env.PARTNER_CREDIT_MAX, 5000),
    perDay: positiveLimit(process.env.PARTNER_CREDIT_DAILY_MAX, 20000),
  };
}

function positiveLimit(value: string | undefined, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
