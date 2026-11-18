import { fetch as undiciFetch, ProxyAgent, type Dispatcher, type RequestInit as UndiciRequestInit } from "undici";

/**
 * AlphaPay payout calls made with an API key are refused unless the TCP
 * connection comes from a whitelisted address. ALPHAPAY_PAYOUT_PROXY_URL is
 * that static-IP proxy (Fixie, QuotaGuard, or a small VPS). The address to
 * paste into AlphaPay "Authorized IP addresses" is the proxy's public IPv4.
 * Deposit checkout and the webhook never use this.
 */
export const ALPHAPAY_PAYOUT_PROXY_REQUIRED =
  "AlphaPay payouts require ALPHAPAY_PAYOUT_PROXY_URL, a static-IP HTTP proxy. This payout was not sent.";

/** True for AlphaPay's payout collection, such as /payouts/initialize/. */
export function isAlphapayPayoutPath(path: string): boolean {
  const pathname = path.split("?")[0].replace(/\/+$/, "") || "/";
  return pathname === "/payouts" || pathname.startsWith("/payouts/");
}

let cachedUrl = "";
let cachedAgent: ProxyAgent | undefined;

/** A dispatcher bound to the configured proxy, or a refusal that sends nothing. */
export function alphapayPayoutDispatcher(): { dispatcher: Dispatcher } | { error: string } {
  const raw = process.env.ALPHAPAY_PAYOUT_PROXY_URL?.trim() ?? "";
  if (!raw) return { error: ALPHAPAY_PAYOUT_PROXY_REQUIRED };

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { error: "ALPHAPAY_PAYOUT_PROXY_URL is not a valid proxy URL. This payout was not sent." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      error: "ALPHAPAY_PAYOUT_PROXY_URL must be an http or https proxy URL. This payout was not sent.",
    };
  }

  if (!cachedAgent || cachedUrl !== raw) {
    cachedAgent = new ProxyAgent(raw);
    cachedUrl = raw;
  }
  return { dispatcher: cachedAgent };
}

/**
 * One payout HTTP call. Returns the proxy error without opening a socket when
 * ALPHAPAY_PAYOUT_PROXY_URL is missing, so the request cannot leave from the
 * platform's own address.
 */
export async function alphapayPayoutFetch(
  url: string,
  init: {
    method?: string;
    headers: Record<string, string>;
    body?: UndiciRequestInit["body"];
    signal: AbortSignal;
  },
): Promise<{ response: { ok: boolean; status: number; json: () => Promise<unknown> } } | { error: string }> {
  const proxy = alphapayPayoutDispatcher();
  if ("error" in proxy) return proxy;

  const response = await undiciFetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    signal: init.signal,
    dispatcher: proxy.dispatcher,
  });
  return { response };
}
