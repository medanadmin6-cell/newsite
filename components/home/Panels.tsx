"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Star,
  Clock,
  Tv,
  Trophy,
  Dices,
  Ticket,
  PlayCircle,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import { useSlip, type SlipLeg } from "@/lib/store";
import { BallIcon } from "@/components/icons";

/**
 * The home page furniture above the match content: the promo story strip, the
 * sport quick panel, the booking-code widget and the highlight chips.
 *
 * Promo photography lives in public/promo under the Pexels licence — see the
 * CREDITS file there. Swapping one is a file replacement, not a code change.
 */

// ------------------------------------------------------------- story list

interface Story {
  title: string;
  kicker?: string;
  href: string;
  art: string;
}

const STORIES: Story[] = [
  { title: "Welcome Bonus", kicker: "GH₵50", href: "/register", art: "/promo/welcome-bonus.jpg" },
  { title: "Best Odds", kicker: "Boosted", href: "/?tab=boosted", art: "/promo/best-odds.jpg" },
  { title: "Top Matches", href: "/?tab=today", art: "/promo/top-matches.jpg" },
  { title: "Live Now", href: "/?tab=live", art: "/promo/live-now.jpg" },
  { title: "Booking Codes", href: "/load-code", art: "/promo/booking-codes.jpg" },
];

export function StoryList() {
  return (
    <div className="scroll-x flex gap-2 px-2.5 py-2.5 md:gap-3 md:px-5">
      {STORIES.map((s) => (
        <Link
          key={s.title}
          href={s.href}
          className="relative h-[88px] w-[86px] shrink-0 overflow-hidden rounded-[8px] ring-1 ring-white/10 md:h-[132px] md:w-[132px]"
        >
          <Image src={s.art} alt="" fill sizes="(min-width: 768px) 132px, 86px" className="object-cover" />
          {/* Scrim so the label stays legible over any artwork. */}
          <span className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 to-transparent" />
          <span className="absolute inset-x-0 bottom-0 p-1.5">
            {s.kicker && (
              <span className="block text-[11px] font-black leading-tight text-[var(--accent)]">
                {s.kicker}
              </span>
            )}
            <span className="block text-[10px] font-bold leading-tight text-white">{s.title}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

// ------------------------------------------------------------ quick panel

const QUICK: { label: string; href: string; Icon: LucideIcon | typeof BallIcon }[] = [
  { label: "Football", href: "/", Icon: BallIcon },
  { label: "Live", href: "/?tab=live", Icon: PlayCircle },
  { label: "Virtuals", href: "/games", Icon: Dices },
  { label: "Code Center", href: "/load-code", Icon: Ticket },
  { label: "Best Odds", href: "/?tab=boosted", Icon: Trophy },
  { label: "More", href: "/az", Icon: MoreHorizontal },
];

export function QuickPanel() {
  return (
    <div className="mx-2.5 rounded-[6px] bg-[var(--bg-elevated)] px-1 py-3 md:mx-5 md:py-4">
      <div className="grid grid-cols-6">
        {QUICK.map(({ label, href, Icon }) => (
          <Link key={label} href={href} className="flex flex-col items-center gap-1.5">
            <Icon size={22} strokeWidth={1.7} className="text-[var(--text-bright)]" />
            <span className="px-0.5 text-center text-[10px] font-medium leading-tight text-[var(--text-muted)]">
              {label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------- load code widget

export function LoadCodeWidget() {
  const router = useRouter();
  const load = useSlip((s) => s.load);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    setTicket(null);
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(code.trim().toUpperCase())}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "That code was not found");
        if (json.ticket) setTicket(json.ticket as string);
        return;
      }
      load(json.booking.selections as SlipLeg[]);
      router.push("/");
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-2.5 mt-2 rounded-[6px] bg-[var(--bg-elevated)] p-2.5 md:mx-5">
      <form onSubmit={submit} className="flex items-center gap-2 rounded-[4px] bg-[var(--bg)] p-1.5">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Paste any booking code"
          maxLength={10}
          className="min-w-0 flex-1 bg-transparent px-2 text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="shrink-0 rounded-[3px] bg-[var(--surface-2)] px-3 py-2 text-[13px] font-medium text-[var(--text)] disabled:opacity-50"
        >
          {busy ? "…" : "Load Code"}
        </button>
      </form>
      {error && (
        <p className="mt-1.5 px-1 text-[11px] text-[var(--lose)]">
          {error}
          {ticket && (
            <>
              {" "}
              <Link href={`/my-bets/${ticket}`} className="font-bold text-[var(--accent)] underline">
                Open it in My Bets
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------- highlight list

export function HighlightList({ liveCount, soonCount }: { liveCount: number; soonCount: number }) {
  const items: {
    Icon: LucideIcon | typeof BallIcon;
    label: string;
    href: string;
    badge: string | null;
  }[] = [
    { Icon: Star, label: "My Favourites", href: "/account", badge: null },
    { Icon: BallIcon, label: "Today's Football", href: "/?tab=today", badge: null },
    {
      Icon: Clock,
      label: "Football in Next 3 Hours",
      href: "/?tab=soon",
      badge: soonCount ? String(soonCount) : null,
    },
    { Icon: Tv, label: "Live Now", href: "/?tab=live", badge: liveCount ? String(liveCount) : null },
  ];

  return (
    <div className="scroll-x flex gap-2 px-2.5 py-2.5 md:gap-3 md:px-5">
      {items.map(({ Icon, label, href, badge }) => (
        <Link
          key={label}
          href={href}
          className="flex h-[58px] w-[168px] shrink-0 items-center gap-2.5 rounded-[6px] bg-[var(--bg-elevated)] px-3 md:h-[64px] md:w-[220px] md:px-4"
        >
          {badge ? (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[12px] font-bold text-[var(--accent)]">
              {badge}
            </span>
          ) : (
            <Icon size={18} strokeWidth={1.8} className="shrink-0 text-[var(--accent)]" />
          )}
          <span className="text-[12px] font-medium leading-tight text-[var(--text)]">{label}</span>
        </Link>
      ))}
    </div>
  );
}
