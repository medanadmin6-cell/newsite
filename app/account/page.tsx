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
  ReceiptText,
  CircleDollarSign,
  Trophy,
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
      <div className="md:mx-auto md:max-w-3xl">
        {/* Identity and tier standing, on the brand ground. */}
        <header className="relative overflow-hidden bg-[var(--surface)] px-4 pb-4 pt-4">
          <ChipWatermark />

          <div className="relative flex items-start gap-3">
            <Image
              src="/avatar.svg"
              alt=""
              width={56}
              height={56}
              className="h-14 w-14 shrink-0 rounded-full"
            />

            <div className="min-w-0 flex-1">
              <Link href="/profile" className="flex items-center gap-1">
                <span className="text-[17px] font-bold text-[var(--text-bright)]">
                  {maskPhone(player.phone)}
                </span>
                <ChevronRight size={16} strokeWidth={2.2} className="text-[var(--text-muted)]" />
              </Link>

              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="text-[15px] font-black text-[var(--text-bright)]">
                  {tier.points.toLocaleString()}
                </span>
                <span className="text-[12px] text-[var(--text-muted)]">
                  / {(tier.next?.at ?? tier.current.at).toLocaleString()} Tier Points
                </span>
                <Link href="/how-to-play" aria-label="About tier points">
                  <Info size={12} strokeWidth={2} className="text-[var(--text-muted)]" />
                </Link>
              </div>

              <div className="relative mt-2 h-1 rounded-full bg-[var(--surface-2)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)]"
                  style={{ width: `${tier.progress * 100}%` }}
                />
                <span
                  className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-[var(--surface)] bg-[var(--accent)]"
                  style={{ left: `calc(${tier.progress * 100}% - 6px)` }}
                />
              </div>

              <div className="mt-1.5 flex justify-between text-[11px] text-[var(--text-muted)]">
                <span>{tier.current.name}</span>
                <span>
                  {tier.next
                    ? `${tier.toNext.toLocaleString()} Tier Points to ${tier.next.name}`
                    : "Top tier reached"}
                </span>
              </div>
            </div>

            <Link href="/profile" aria-label="Settings" className="shrink-0 text-[var(--text-bright)]">
              <Settings size={20} strokeWidth={1.8} />
            </Link>
          </div>
        </header>

        {/* Balance and the two money actions. */}
        <section className="bg-[var(--surface)] px-4 pb-4">
          <p className="text-[12px] text-[var(--text-muted)]">Total Balance</p>
          <div className="mt-0.5 flex items-center gap-2">
            <button
              onClick={() => setHidden((h) => !h)}
              aria-label={hidden ? "Show balance" : "Hide balance"}
              className="text-[var(--text-muted)]"
            >
              {hidden ? <EyeOff size={18} strokeWidth={1.8} /> : <Eye size={18} strokeWidth={1.8} />}
            </button>
            <p className="text-[28px] font-black leading-none text-[var(--text-bright)]">
              {hidden ? "••••••" : formatMoney(balance, player.currency)}
            </p>
          </div>

          {/* Withdraw is shown to every player, not only a sub-admin. The
              screen behind it states the gate and the progress toward it; a
              hidden button leaves a player unable to find out why they cannot
              withdraw, or what would change it. */}
          <div className="mt-3.5 grid grid-cols-2 gap-3">
            <Link
              href="/deposit"
              className="flex items-center justify-center gap-2 rounded-[4px] bg-[var(--accent)] py-3 text-[15px] font-bold text-[var(--accent-ink)]"
            >
              <Wallet size={18} strokeWidth={2} />
              Deposit
            </Link>
            <Link
              href="/withdraw"
              className="flex items-center justify-center gap-2 rounded-[4px] py-3 text-[15px] font-bold text-[var(--text-bright)] ring-1 ring-[var(--text-bright)]"
            >
              <Banknote size={18} strokeWidth={2} />
              Withdraw
            </Link>
          </div>
        </section>

        {swept !== null && (
          <p className="mx-4 mt-3 rounded bg-[var(--win)]/15 px-3 py-2.5 text-[12px] text-[var(--win)]">
            We found {swept} completed deposit{swept === 1 ? "" : "s"} and credited your wallet.
          </p>
        )}

        <Link
          href="/how-to-play#loyalty"
          className="mx-4 mt-3 flex items-center justify-between rounded-[4px] px-4 py-3.5"
          style={{ background: "linear-gradient(100deg,#2f6bff,#1d4ed8)" }}
        >
          <span className="flex items-center gap-2">
            <Trophy size={19} strokeWidth={1.9} className="text-[var(--pending)]" />
            <span className="text-[15px] font-bold text-white">Loyalty Rewards</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="text-right">
              <span className="block text-[10px] text-white/70">Potential Reward</span>
              <span className="block text-[13px] font-bold text-[var(--pending)]">
                {formatMoney(tier.potentialReward, player.currency)}
              </span>
            </span>
            <ChevronRight size={17} strokeWidth={2.2} className="text-white/80" />
          </span>
        </Link>

        <div className="mx-4 mt-3 grid grid-cols-2 gap-3">
          <Tile href="/my-bets" icon={<ReceiptText size={22} strokeWidth={1.7} />} label="Bet History" />
          <Tile
            href="/transactions"
            icon={<CircleDollarSign size={22} strokeWidth={1.7} />}
            label="Transactions"
          />
        </div>

        <nav className="mt-4">
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
          className="mx-4 mt-5 flex w-[calc(100%-2rem)] items-center justify-center gap-2 rounded py-3 text-[13px] font-bold text-[var(--lose)] ring-1 ring-[var(--line)]"
        >
          <LogOut size={15} strokeWidth={2} />
          Log out
        </button>
      </div>

      <SupportChat />
    </Page>
  );
}

/** The chip motif behind the account header. */
function ChipWatermark() {
  return (
    <svg
      className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 text-white opacity-[0.05]"
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray="14 9" />
      <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="3" />
      <text
        x="50"
        y="63"
        textAnchor="middle"
        fontSize="34"
        fontWeight="900"
        fill="currentColor"
        fontFamily="system-ui, sans-serif"
      >
        B
      </text>
    </svg>
  );
}

function Tile({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 rounded-[4px] bg-[var(--bg-elevated)] py-4 text-[var(--text-bright)]"
    >
      {icon}
      <span className="text-[12px] font-medium">{label}</span>
    </Link>
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
      className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3.5"
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
