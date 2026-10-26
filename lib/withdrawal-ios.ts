export type WithdrawalIosPayload = {
  amount: number;
  currentBalance: number;
  currency?: string;
  brandName?: string;
};

declare global {
  interface Window {
    WithdrawalNotification?: {
      configure: (options: Record<string, unknown>) => void;
      show: (options: Record<string, unknown>) => void;
      hide: () => void;
    };
  }
}

const SCRIPT_SRC = "/withdrawal-notification/withdrawal-notification.js";

function loadNotificationScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.WithdrawalNotification?.show) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const waitForGlobal = window.setInterval(() => {
      if (!window.WithdrawalNotification?.show) return;
      window.clearInterval(waitForGlobal);
      finish();
    }, 50);
    window.setTimeout(() => {
      window.clearInterval(waitForGlobal);
      finish();
    }, 4000);

    if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) return;

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = false;
    script.onload = () => {
      window.clearInterval(waitForGlobal);
      finish();
    };
    script.onerror = () => {
      window.clearInterval(waitForGlobal);
      finish();
    };
    document.body.appendChild(script);
  });
}

/** Plays the iOS withdrawal alert + MobileMoney banner after the server confirms. */
export function showWithdrawalIos(options: WithdrawalIosPayload): void {
  if (typeof window === "undefined") return;
  const payload = {
    amount: options.amount,
    currentBalance: options.currentBalance,
    currency: options.currency || "GHS",
    brandName: options.brandName || "Velora",
    assetBase: "/withdrawal-notification/assets",
  };

  void loadNotificationScript().then(() => {
    window.WithdrawalNotification?.configure?.({
      assetBase: "/withdrawal-notification/assets",
      brandName: payload.brandName,
    });
    window.WithdrawalNotification?.show?.(payload);
  });
}
