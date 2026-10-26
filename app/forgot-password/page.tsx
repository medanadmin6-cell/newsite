"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getCountry } from "@/lib/countries";
import { CountryBar, PhoneField, PrimaryButton } from "@/components/AuthFields";

/**
 * Password reset. There is no reset rail in the platform yet — no email
 * provider is wired and SMS is send-only — so this collects the number and
 * routes the player to support rather than pretending to send a code.
 */
export default function ForgotPasswordPage() {
  const router = useRouter();
  const [countryCode, setCountryCode] = useState("GH");
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);

  const country = getCountry(countryCode);
  const whatsapp = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="mx-auto w-full max-w-[455px] px-6 pb-16 pt-5">
        <CountryBar country={country} onChange={setCountryCode} onClose={() => router.push("/login")} />

        <h1 className="mt-8 text-[18px] font-medium">Reset your password</h1>

        {sent ? (
          <div className="mt-6 space-y-4">
            <p className="rounded-[3px] bg-[var(--field)] px-4 py-3.5 text-[14px] leading-relaxed text-[var(--text-muted)] ring-1 ring-[var(--field-line)]">
              Our team will verify your number and reset the password for you. This is handled by a
              person, so it is not instant.
            </p>
            {whatsapp && (
              <a
                href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-[3px] bg-[var(--accent)] py-3.5 text-center text-[16px] font-medium text-[var(--accent-ink)]"
              >
                Message support on WhatsApp
              </a>
            )}
            <Link href="/login" className="block text-center text-[15px] font-medium text-[var(--accent)]">
              Back to login
            </Link>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              // The button stays lime, so the check lives here.
              if (!phone.trim()) return;
              setSent(true);
            }}
            className="mt-6 space-y-4"
          >
            <PhoneField country={country} value={phone} onChange={setPhone} autoFocus />
            <PrimaryButton type="submit">
              Continue
            </PrimaryButton>
            <Link href="/login" className="block text-center text-[15px] font-medium text-[var(--accent)]">
              Back to login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
