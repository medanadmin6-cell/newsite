"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    WithdrawalNotification?: {
      configure: (options: Record<string, unknown>) => void;
      show: (options: Record<string, unknown>) => void;
      hide: () => void;
    };
  }
}

export function WithdrawalIosBoot() {
  useEffect(() => {
    const boot = () => {
      window.WithdrawalNotification?.configure({
        assetBase: "/withdrawal-notification/assets",
        brandName: "Betvanta",
      });
    };
    if (window.WithdrawalNotification) {
      boot();
      return;
    }
    const t = window.setInterval(() => {
      if (window.WithdrawalNotification) {
        window.clearInterval(t);
        boot();
      }
    }, 50);
    return () => window.clearInterval(t);
  }, []);

  return null;
}
