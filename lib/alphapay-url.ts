/**
 * A hosted AlphaPay session, such as https://pay.alphapay.me/checkout/<slug>
 * or https://checkout.alphapay.me/<slug>.
 *
 * The bare host has no session. Opening it shows AlphaPay's own
 * "Payment session not found" page, so it is never a place we send a player.
 */
export function alphapaySessionUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const slug = parts[parts.length - 1];
  if (!slug || slug.toLowerCase() === "checkout") return null;
  return value;
}
