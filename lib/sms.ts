/**
 * Arkesel SMS. Always best-effort: a failed message must never block money
 * that has already moved, so every function here swallows its errors.
 */

const ENDPOINT = "https://sms.arkesel.com/api/v2/sms/send";

export async function sendSms(to: string, message: string): Promise<boolean> {
  const key = process.env.ARKESEL_API_KEY;
  const sender = process.env.ARKESEL_SENDER_ID || "3btafric";

  if (!key) {
    console.warn("[sms] ARKESEL_API_KEY unset — skipping:", to, message);
    return false;
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ sender, message, recipients: [to] }),
    });
    if (!res.ok) {
      console.error("[sms] send failed", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[sms] send threw", err);
    return false;
  }
}

export function paymentReceivedSms(amount: number, currency: string, balance: number) {
  return `Velora: Your deposit of ${currency} ${amount.toFixed(2)} was received. New balance: ${currency} ${balance.toFixed(2)}. Good luck!`;
}

export function withdrawalRequestedSms(amount: number, currency: string) {
  return `Velora: Your withdrawal request of ${currency} ${amount.toFixed(2)} has been received and is being processed.`;
}
