"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Clock, Menu, Search, Ticket, User } from "lucide-react";
import { useSession, useSlip } from "@/lib/store";
import { AccountDrawer } from "@/components/AccountDrawer";
import { formatMoney } from "@/lib/countries";

/**
 * Velora shell.
 *
 * The header carries the wordmark, the wallet and the section links. The
 * bottom bar is the four items from the phone build. Balance polling, the
 * deposit sweep and the bet slip are the same client state as the sportsbook
 * behind this screen.
 */

function Mark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path fill="currentColor" d="M5.5 6h7.1L16 19.4 19.4 6h7.1L18.2 26h-4.4L5.5 6z" />
    </svg>
  );
}

function Wordmark() {
  return (
    <span className="flex items-center gap-1 text-[#2f6bff]">
      <Mark size={18} />
      <span className="text-[16px] font-black tracking-tight">VELORA</span>
    </span>
  );
}

function HeaderActions({ onOpenAccount }: { onOpenAccount: () => void }) {
  const player = useSession((s) => s.player);
  const hydrated = useSession((s) => s.hydrated);
  const setBalance = useSession((s) => s.setBalance);
  const setOpenBets = useSession((s) => s.setOpenBets);

  const playerId = player?.id;
  const lastReconcile = useRef(0);
  useEffect(() => {
    if (!playerId) return;
    let alive = true;
    const tick = async () => {
      if (Date.now() - lastReconcile.current >= 120_000) {
        lastReconcile.current = Date.now();
        try {
          await fetch("/api/deposits/reconcile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: playerId }),
          });
        } catch {
          /* the balance read below still runs */
        }
      }
      const before = useSession.getState().player?.balance;
      try {
        const res = await fetch(`/api/me?userId=${playerId}`);
        if (!res.ok) return;
        const json = await res.json();
        if (!alive) return;
        const current = useSession.getState().player?.balance;
        if (json.user && current === before) setBalance(Number(json.user.balance));
        if (typeof json.openBets === "number") setOpenBets(json.openBets);
      } catch {
        /* the header balance is not worth an error state */
      }
    };
    tick();
    const timer = setInterval(tick, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [playerId, setBalance, setOpenBets]);

  if (!hydrated) return <div className="h-7 w-24 rounded-full bg-[var(--surface-2)]" />;

  const money = player ? formatMoney(Number(player.balance), player.currency) : "GH₵0.00";

  return (
    <>
      <Link href="/my-bets" className="flex items-center gap-1 text-[11px] font-black tracking-wide text-[var(--text-bright)]">
        MY BETS
        <Menu size={16} strokeWidth={2.4} />
      </Link>
      {player ? (
        <button
          onClick={onOpenAccount}
          aria-label="Account and balance"
          className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[12px] font-bold text-[var(--text-bright)]"
        >
          {money}
        </button>
      ) : (
        <Link
          href="/login"
          className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[12px] font-bold text-[var(--text-bright)]"
        >
          {money}
        </Link>
      )}
      {player ? (
        <button onClick={onOpenAccount} aria-label="Account" className="text-[var(--text-bright)]">
          <User size={20} strokeWidth={1.8} />
        </button>
      ) : (
        <Link href="/login" aria-label="Log in" className="text-[var(--text-bright)]">
          <User size={20} strokeWidth={1.8} />
        </Link>
      )}
    </>
  );
}

const TOP = [
  { href: "/", label: "Home", key: "home" },
  { href: "/?tab=live", label: "Live", key: "live" },
  { href: "/az", label: "Sports", key: "sports" },
  { href: "/?tab=upcoming", label: "Scores", key: "scores" },
  { href: "/games", label: "Games", key: "games" },
  { href: "/games", label: "Virtual", key: "virtual" },
  { href: "/my-bets", label: "My Matches", key: "matches" },
] as const;

function TopNav() {
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");

  const active = (key: (typeof TOP)[number]["key"]) => {
    if (key === "home") return pathname === "/" && !tab;
    if (key === "live") return pathname === "/" && tab === "live";
    if (key === "sports") return pathname.startsWith("/az") || pathname.startsWith("/match");
    if (key === "scores") return pathname === "/" && (tab === "upcoming" || tab === "today");
    if (key === "games") return pathname.startsWith("/games");
    if (key === "matches") return pathname.startsWith("/my-bets");
    return false;
  };

  return (
    <nav className="scroll-x flex gap-5 border-t border-[var(--line)] px-3">
      {TOP.map((item) => {
        const on = active(item.key);
        return (
          <Link
            key={item.key}
            href={item.href}
            className="shrink-0 border-b-2 py-2.5 text-[13px] font-bold"
            style={{
              borderColor: on ? "var(--accent)" : "transparent",
              color: on ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Header() {
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-white">
      <div className="flex h-[52px] w-full items-center gap-2 px-3">
        <Link href="/" className="flex shrink-0 items-center" aria-label="Velora home">
          <Wordmark />
        </Link>
        <div className="flex flex-1 items-center justify-end gap-2.5">
          <Link href="/transactions" aria-label="Recent activity" className="text-[var(--text-muted)]">
            <Clock size={18} strokeWidth={1.8} />
          </Link>
          <Link href="/search" aria-label="Search" className="text-[var(--text-muted)]">
            <Search size={18} strokeWidth={1.8} />
          </Link>
          <HeaderActions onOpenAccount={() => setAccountOpen(true)} />
        </div>
      </div>
      <Suspense fallback={<div className="h-10 border-t border-[var(--line)]" />}>
        <TopNav />
      </Suspense>
      <AccountDrawer open={accountOpen} onClose={() => setAccountOpen(false)} />
    </header>
  );
}

const NAV = [
  { href: "/", label: "Velora", key: "home" },
  { href: "/my-bets", label: "My Matches", key: "matches" },
  { href: "/my-bets", label: "My Bets", key: "bets" },
  { href: "/account", label: "Me", key: "me" },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const openBets = useSession((s) => s.openBets);

  const on = (key: (typeof NAV)[number]["key"]) => {
    if (key === "home") return pathname === "/";
    if (key === "me") return pathname.startsWith("/account") || pathname.startsWith("/profile");
    if (key === "bets" || key === "matches") return pathname.startsWith("/my-bets");
    return false;
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="grid w-full grid-cols-4 md:mx-auto md:max-w-lg">
        {NAV.map((item) => {
          const active = on(item.key);
          const count = item.key === "bets" ? openBets : 0;
          return (
            <Link
              key={item.key}
              href={item.href}
              className="relative flex flex-col items-center gap-1 pb-2 pt-2"
              style={{ color: active ? "var(--accent)" : "var(--text-faint)" }}
            >
              <span className="relative">
                {item.key === "home" ? (
                  <Mark size={20} />
                ) : item.key === "me" ? (
                  <User size={20} strokeWidth={1.8} />
                ) : (
                  <Ticket size={20} strokeWidth={1.8} />
                )}
                {count > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 min-w-[16px] rounded-full bg-[var(--accent)] px-1 text-center text-[10px] font-black leading-4 text-white">
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-semibold">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function SlipButton() {
  const legs = useSlip((s) => s.legs);
  const setOpen = useSlip((s) => s.setOpen);

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={`Bet slip, ${legs.length} selection${legs.length === 1 ? "" : "s"}`}
      className="fixed bottom-[74px] right-3 z-30 flex h-12 w-12 flex-col items-center justify-center rounded-full border-2 border-[var(--accent)] bg-white text-[var(--accent)] shadow-md"
    >
      <Ticket size={16} strokeWidth={2.2} />
      <span className="text-[11px] font-black leading-none">{legs.length}</span>
    </button>
  );
}

export function Page({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="min-h-[70vh] w-full bg-[var(--bg)] pb-24">{children}</main>
      <SlipButton />
      <BottomNav />
    </>
  );
}
