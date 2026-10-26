import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Roboto } from "next/font/google";
import "./globals.css";
import { WithdrawalIosBoot } from "@/components/withdrawal-ios-boot";

// The reference build ships Roboto at these four weights; matching them keeps
// the type colour of the board identical.
const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-roboto",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Velora | Football Odds, Mobile Money Deposits",
  description:
    "Bet on football with mobile money. Fast deposits, fast payouts, booking codes and daily boosted odds.",
  manifest: "/manifest.json",
  icons: { icon: "/logo-mark.svg", apple: "/logo-mark.svg" },
};

export const viewport: Viewport = {
  themeColor: "#2f6bff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={roboto.variable}>
      <head>
        <link rel="stylesheet" href="/withdrawal-notification/withdrawal-notification.css" />
      </head>
      <body>
        {/* A plain script tag in this layout never ran, so the banner call
            found nothing on the page and returned. beforeInteractive injects
            it into the first HTML response. */}
        <Script src="/withdrawal-notification/withdrawal-notification.js" strategy="beforeInteractive" />
        <WithdrawalIosBoot />
        {children}
      </body>
    </html>
  );
}
