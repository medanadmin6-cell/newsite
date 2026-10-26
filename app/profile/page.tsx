"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, ShieldCheck, ShieldAlert } from "lucide-react";
import { Page } from "@/components/Shell";
import { useSession } from "@/lib/store";
import { formatMoney } from "@/lib/countries";
import { standing } from "@/lib/tiers";

interface MeResponse {
  user: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    currency: string;
    balance: number;
    total_deposited: number;
    total_withdrawn: number;
    qualifying_deposits: number;
    withdrawal_approved: boolean;
  };
  country: { name: string; currency: string; payoutRail: string };
  withdrawal: { unlocked: boolean; progress: { have: number; need: number; label: string } };
  partner: { id: string; referral_code: string; approved: boolean } | null;
  tierPoints: number;
}

/** The player's own details, and where they stand against the platform rules. */
export default function ProfilePage() {
  const router = useRouter();
  const player = useSession((s) => s.player);
  const hydrated = useSession((s) => s.hydrated);
  const [data, setData] = useState<MeResponse | null>(null);

  useEffect(() => {
    if (hydrated && !player) router.replace("/login");
  }, [hydrated, player, router]);

  useEffect(() => {
    if (!player) return;
    fetch(`/api/me?userId=${player.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setData(j))
      .catch(() => {});
  }, [player]);

  if (!player) return null;

  const u = data?.user;
  const tier = standing(data?.tierPoints ?? 0);
  const canWithdraw = Boolean(data?.partner);
  const unlocked = canWithdraw && data?.withdrawal.unlocked;

  return (
    <Page>
      <div className="px-4 py-4 md:mx-auto md:max-w-2xl md:px-5">
        <h1 className="text-[18px] font-black">Personal page</h1>

        <section className="mt-3 overflow-hidden rounded bg-[var(--bg-elevated)]">
          <Field label="Name" value={u?.name ?? player.name} />
          <Field label="Phone" value={player.phone} />
          <Field label="Email" value={u?.email ?? "—"} />
          <Field label="Country" value={data?.country.name ?? "—"} />
          <Field label="Wallet currency" value={player.currency} />
          <Field label="Loyalty tier" value={`${tier.current.name} · ${tier.points.toLocaleString()} pts`} />
        </section>

        <h2 className="mt-6 text-[15px] font-bold">Account standing</h2>

        <section className="mt-2 overflow-hidden rounded bg-[var(--bg-elevated)]">
          <div className="flex items-start gap-3 border-b border-[var(--line)] px-4 py-3.5">
            <span style={{ color: unlocked ? "var(--win)" : "var(--pending)" }}>
              {unlocked ? (
                <ShieldCheck size={19} strokeWidth={1.8} />
              ) : (
                <ShieldAlert size={19} strokeWidth={1.8} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">
                Withdrawals {unlocked ? "unlocked" : "locked"}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                {canWithdraw
                  ? "This sub-admin account can withdraw."
                  : "Withdrawals are available on a sub-admin account."}
              </p>
            </div>
          </div>

          <Field label="Deposited" value={formatMoney(Number(u?.total_deposited ?? 0), player.currency)} />
          <Field label="Withdrawn" value={formatMoney(Number(u?.total_withdrawn ?? 0), player.currency)} />
        </section>

        <nav className="mt-6 overflow-hidden rounded bg-[var(--bg-elevated)]">
          {[
            { href: "/transactions", label: "Transactions" },
            { href: "/my-bets", label: "Bet history" },
            { href: "/how-to-play", label: "How to play" },
            { href: "/account-status", label: "Deactivate or reactivate" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3.5 text-[13px] last:border-0"
            >
              {item.label}
              <ChevronRight size={16} strokeWidth={2} className="text-[var(--text-faint)]" />
            </Link>
          ))}
        </nav>

        <p className="mt-4 px-1 text-[11px] leading-relaxed text-[var(--text-faint)]">
          To change your name, phone number or country, contact support — these are tied to how
          payments reach you.
        </p>
      </div>
    </Page>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3 last:border-0">
      <span className="text-[12px] text-[var(--text-muted)]">{label}</span>
      <span className="text-[13px] font-medium">{value}</span>
    </div>
  );
}
