"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  X,
  Eye,
  EyeOff,
  RefreshCw,
  Wallet,
  Banknote,
  CircleDollarSign,
  Headphones,
  Ticket,
  Award,
} from "lucide-react";
import { useSession } from "@/lib/store";
import { formatMoney } from "@/lib/countries";

/**
 * The account panel that drops from the header.
 *
 * Two balances, because they are genuinely different numbers here: the wallet
 * total, and what of it can actually leave. Until the withdrawal gate opens,
 * the withdrawable figure is zero — showing one number would misrepresent it.
 */

interface Summary {
  balance: number;
  withdrawable: number;
  openBets: number;
  tierPoints: number;
  gateLabel: string;
  unlocked: boolean;
}

export function AccountDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const player = useSession((s) => s.player);
  const setBalance = useSession((s) => s.setBalance);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [hidden, setHidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Bumping the nonce re-runs the effect, so a manual refresh never calls
  // setState straight from the effect body.
  const [nonce, setNonce] = useState(0);
  const load = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!open || !player) return;
    let alive = true;

    (async () => {
      if (alive) setRefreshing(true);
      try {
        const [meRes, betsRes] = await Promise.all([
          fetch(`/api/me?userId=${player.id}`),
          fetch(`/api/bets/mine?userId=${player.id}`),
        ]);

        if (!meRes.ok || !alive) return;
        const me = await meRes.json();
        const bets = betsRes.ok ? await betsRes.json() : { bets: [] };
        if (!alive) return;

        const balance = Number(me.user.balance);
        setBalance(balance);
        setSummary({
          balance,
          // Withdrawable is what the gate has actually opened, which is not the
          // same as being allowed to look.
          withdrawable: me.withdrawal.unlocked ? balance : 0,
          openBets: (bets.bets ?? []).filter((b: { status: string }) => b.status === "pending").length,
          tierPoints: me.tierPoints ?? 0,
          gateLabel: me.withdrawal.progress.label,
          unlocked: Boolean(me.withdrawal.unlocked),
        });
      } catch {
        /* the panel falls back to the session balance */
      } finally {
        if (alive) setRefreshing(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, player, nonce, setBalance]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !player) return null;

  const balance = summary?.balance ?? Number(player.balance);
  const withdrawable = summary?.withdrawable ?? 0;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-label="Account">
      <button className="absolute inset-0 bg-black/70" onClick={onClose} aria-label="Close" />

      <div className="relative mx-auto max-w-2xl px-3 pt-3">
        <div className="overflow-hidden rounded-[10px] bg-[var(--bg-elevated)] shadow-2xl">
          <header className="flex items-center gap-3 px-4 py-3.5">
            <Image src="/avatar.svg" alt="" width={36} height={36} className="h-9 w-9 rounded-full" />
            <span className="flex-1 truncate text-[17px] font-bold text-[var(--text-bright)]">
              {player.name}
            </span>
            <button onClick={onClose} aria-label="Close" className="text-[var(--text-bright)]">
              <X size={22} strokeWidth={2} />
            </button>
          </header>

          {/* Balances */}
          <div
            className="mx-4 rounded-[8px] p-4"
            style={{ background: "linear-gradient(150deg,#2f6bff,#1d4ed8)" }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[12px] text-white/80">Total Balance</p>
                <p className="mt-0.5 text-[26px] font-black leading-none text-white">
                  {hidden ? "••••••" : formatMoney(balance, player.currency)}
                </p>
              </div>
              <div className="flex items-center gap-3 text-white">
                <button onClick={() => setHidden((h) => !h)} aria-label={hidden ? "Show" : "Hide"}>
                  {hidden ? <EyeOff size={17} strokeWidth={1.8} /> : <Eye size={17} strokeWidth={1.8} />}
                </button>
                <button onClick={load} aria-label="Refresh" disabled={refreshing}>
                  <RefreshCw
                    size={16}
                    strokeWidth={2}
                    className={refreshing ? "animate-spin" : undefined}
                  />
                </button>
              </div>
            </div>

            <div className="mt-3">
              <p className="text-[12px] text-white/80">Withdrawable Balance</p>
              <p className="mt-0.5 text-[20px] font-black leading-none text-white">
                {hidden ? "••••" : formatMoney(withdrawable, player.currency)}
              </p>
              {summary && !summary.unlocked && (
                <p className="mt-1 text-[11px] text-[var(--pending)]">{summary.gateLabel}</p>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Stat
                icon={<Ticket size={15} strokeWidth={2} className="text-[var(--hint)]" />}
                label="Open Bets"
                value={summary?.openBets ?? 0}
              />
              <Stat
                icon={<Award size={15} strokeWidth={2} className="text-[var(--pending)]" />}
                label="Tier Points"
                value={summary?.tierPoints ?? 0}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-4 gap-1 px-2 py-5">
            <Action href="/deposit" icon={<Wallet size={22} strokeWidth={1.6} />} label="Deposit" onGo={onClose} />
            {/* Shown to every player. Whether money can actually leave is the
                gate's answer, and the withdraw screen states it -- hiding the
                way in leaves a player who has not verified with nothing to
                read and nothing to do about it. */}
            <Action href="/withdraw" icon={<Banknote size={22} strokeWidth={1.6} />} label="Withdraw" onGo={onClose} />
            <Action
              href="/transactions"
              icon={<CircleDollarSign size={22} strokeWidth={1.6} />}
              label="Transactions"
              onGo={onClose}
            />
            <Action
              href="/how-to-play#support"
              icon={<Headphones size={22} strokeWidth={1.6} />}
              label="24/7 Service"
              onGo={onClose}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div>
      <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 text-[17px] font-black text-[var(--text-bright)]">
        {icon}
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function Action({
  href,
  icon,
  label,
  onGo,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  onGo: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onGo}
      className="flex flex-col items-center gap-2 py-1 text-[var(--text-bright)]"
    >
      {icon}
      <span className="text-center text-[11px] leading-tight text-[var(--text)]">{label}</span>
    </Link>
  );
}
