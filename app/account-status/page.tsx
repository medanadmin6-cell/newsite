"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";

/**
 * Deactivation and reactivation. Both are operator actions — nothing here
 * changes an account on its own.
 */
export default function AccountStatusPage() {
  const router = useRouter();
  const whatsapp = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="mx-auto w-full max-w-[455px] px-6 pb-16 pt-5">
        <div className="flex items-center justify-between py-1">
          <h1 className="text-[28px] font-black leading-none text-[var(--text-bright)]">Account status</h1>
          <button
            onClick={() => router.push("/login")}
            aria-label="Close"
            className="text-[var(--text-bright)]"
          >
            <X size={22} strokeWidth={2} />
          </button>
        </div>

        <div className="mt-6 space-y-3">
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-[15px] font-black">Deactivate</h2>
            <p className="mt-1 text-[14px] leading-relaxed text-[var(--text-muted)]">
              Closes your account and stops all activity. Any balance is paid out first — withdraw
              before you ask us to close it.
            </p>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-[15px] font-black">Reactivate</h2>
            <p className="mt-1 text-[14px] leading-relaxed text-[var(--text-muted)]">
              We can reopen a closed account on the same phone number. Your bet history comes back
              with it.
            </p>
          </section>

          {whatsapp ? (
            <a
              href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-full bg-[var(--accent)] py-3.5 text-center text-[16px] font-black text-white"
            >
              Contact support
            </a>
          ) : (
            <p className="rounded-2xl bg-white px-4 py-3.5 text-center text-[14px] text-[var(--text-muted)] shadow-sm">
              Support contact is not configured on this deployment.
            </p>
          )}

          <Link href="/login" className="block py-2 text-center text-[15px] font-medium text-[var(--accent)]">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
