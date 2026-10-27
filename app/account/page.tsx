"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Settings,
  Eye,
  EyeOff,
  Wallet,
  Banknote,
  CircleDollarSign,
  ChevronRight,
  Info,
  Headphones,
  UserRound,
  Handshake,
  LogOut,
} from "lucide-react";
import { Page } from "@/components/Shell";
import { SupportChat } from "@/components/SupportChat";
import { useSession } from "@/lib/store";
import { formatMoney } from "@/lib/countries";
import { standing, maskPhone } from "@/lib/tiers";

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
    verification_step: number;
    qualifying_deposits: number;
    withdrawal_approved: boolean;
  };
  country: { name: string; currency: string; payoutRail: string };
  withdrawal: {
    unlocked: boolean;
    failed?: string;
    progress: { have: number; need: number; label: string };
  };
  partner: { id: string; referral_code: string; approved: boolean } | null;
  tierPoints: number;
}

function AccountView() {
  const router = useRouter();
  const player = useSession((s) => s.player);
  const hydrated = useSession((s) => s.hydrated);
  const signOut = useSession((s) => s.signOut);
  const setBalance = useSession((s) => s.setBalance);

  const [data, setData] = useState<MeResponse | null>(null);
  const [swept, setSwept] = useState<number | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (hydrated && !player) router.replace("/login");
  }, [hydrated, player, router]);

  useEffect(() => {
    if (!player) return;
    let alive = true;

    const run = async () => {
      // Sweep up anything that settled while the player was away — a closed tab
      // before the redirect fired is the one way hosted checkouts go wrong.
      // Credits are idempotent, so calling this on every load is safe.
      try {
        const res = await fetch("/api/deposits/reconcile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: player.id }),
        });
        const json = await res.json();
        if (alive && json.credited > 0) setSwept(json.credited);
      } catch {
        /* reconciliation is best-effort */
      }

      try {
        const res = await fetch(`/api/me?userId=${player.id}`);
        if (!res.ok) return;
        const json: MeResponse = await res.json();
        if (!alive) return;
        setData(json);
        setBalance(Number(json.user.balance));
      } catch {
        /* the page renders from the session until this lands */
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, [player, setBalance]);

  if (!player) return null;

  const balance = Number(data?.user.balance ?? player.balance);
  const tier = standing(data?.tierPoints ?? 0);

  return (
    <Page>
      <div className="px-3 pt-3 md:mx-auto md:max-w-lg">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#2f6bff] to-[#1d4ed8] p-5 text-white">
          <div className="flex items-center gap-3">
            <Image src="/avatar.svg" alt="" width={52} height={52} className="h-[52px] w-[52px] rounded-full bg-white/20" />
            <div className="min-w-0 flex-1">
              <Link href="/profile" className="flex items-center gap-1">
                <span className="truncate text-[16px] font-black">{player.name || maskPhone(player.phone)}</span>
                <ChevronRight size={16} strokeWidth={2.2} />
              </Link>
              <p className="text-[12px] text-white/75">{maskPhone(player.phone)} · {tier.current.name}</p>
            </div>
            <Link href="/profile" aria-label="Settings" className="text-white">
              <Settings size={20} strokeWidth={1.8} />
            </Link>
          </div>

          <div className="mt-5 flex items-end justify-between">
            <div>
              <p className="text-[12px] text-white/75">Wallet</p>
              <p className="text-[32px] font-black leading-none">
                {hidden ? "••••••" : formatMoney(balance, player.currency)}
              </p>
            </div>
            <button
              onClick={() => setHidden((h) => !h)}
              aria-label={hidden ? "Show balance" : "Hide balance"}
              className="mb-1 text-white/80"
            >
              {hidden ? <EyeOff size={18} strokeWidth={1.8} /> : <Eye size={18} strokeWidth={1.8} />}
            </button>
          </div>
        </section>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {[
            { href: "/deposit", label: "Deposit", Icon: Wallet },
            { href: "/withdraw", label: "Withdraw", Icon: Banknote },
            { href: "/transactions", label: "History", Icon: CircleDollarSign },
            { href: "/profile", label: "Profile", Icon: UserRound },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="flex flex-col items-center gap-1.5">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e7efff] text-[var(--accent)]">
                <item.Icon size={18} strokeWidth={2} />
              </span>
              <span className="text-[10px] font-bold text-[var(--text-muted)]">{item.label}</span>
            </Link>
          ))}
        </div>

        <Link href="/how-to-play#loyalty" className="mt-3 block rounded-2xl bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-black">{tier.current.name}</span>
            <span className="text-[var(--text-muted)]">
              {tier.next ? `${tier.toNext.toLocaleString()} to ${tier.next.name}` : "Top tier"}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${tier.progress * 100}%` }} />
          </div>
        </Link>

        {swept !== null && (
          <p className="mt-3 rounded-2xl bg-[var(--win)]/15 px-3 py-2.5 text-[12px] text-[var(--win)]">
            We found {swept} completed deposit{swept === 1 ? "" : "s"} and credited your wallet.
          </p>
        )}

        <nav className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm">
          {data?.partner && (
            <Row
              href="/partner"
              icon={<Handshake size={19} strokeWidth={1.8} />}
              label="Partner dashboard"
              hint={`Code ${data.partner.referral_code}${data.partner.approved ? "" : " · awaiting approval"}`}
              accent
            />
          )}
          <Row href="/profile" icon={<UserRound size={19} strokeWidth={1.8} />} label="Personal Page" />
          <Row href="/how-to-play" icon={<Info size={19} strokeWidth={1.8} />} label="How to play" />
          <Row
            href="/how-to-play#support"
            icon={<Headphones size={19} strokeWidth={1.8} />}
            label="24/7 Customer Service"
            dot
          />
          {!data?.partner && (
            <Row
              href="/partner"
              icon={<Handshake size={19} strokeWidth={1.8} />}
              label="Become a partner"
            />
          )}
        </nav>

        <button
          onClick={() => {
            signOut();
            router.push("/");
          }}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3 text-[13px] font-bold text-[var(--lose)] shadow-sm"
        >
          <LogOut size={15} strokeWidth={2} />
          Log out
        </button>
      </div>

      <SupportChat />
    </Page>
  );
}

function Row({
  href,
  icon,
  label,
  hint,
  dot,
  accent,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  dot?: boolean;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3.5 last:border-b-0"
      style={accent ? { background: "var(--bg-elevated)" } : undefined}
    >
      <span style={{ color: accent ? "var(--accent)" : "var(--text-muted)" }}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px]">{label}</span>
        {hint && <span className="block text-[11px] text-[var(--text-muted)]">{hint}</span>}
      </span>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-[var(--win)]" />}
      <ChevronRight size={17} strokeWidth={2} className="text-[var(--text-faint)]" />
    </Link>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountView />
    </Suspense>
  );
}
