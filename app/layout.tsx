import type { Metadata, Viewport } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import "./globals.css";
import { WithdrawalIosBoot } from "@/components/withdrawal-ios-boot";

// The reference build ships Roboto at these four weights; matching them keeps
// the type colour of the board identical. The files live in the repo: loading
// them from Google at build time failed the production build whenever that
// download did.
const roboto = localFont({
  src: [
    { path: "./fonts/roboto-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/roboto-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/roboto-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "./fonts/roboto-latin-900-normal.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-roboto",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Betvanta | Football Odds, Mobile Money Deposits",
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
        <Script src="/withdrawal-notification/withdrawal-notification.js?v=ghs" strategy="beforeInteractive" />
        <WithdrawalIosBoot />
        {children}
      </body>
    </html>
  );
}
