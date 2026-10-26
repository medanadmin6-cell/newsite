"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Share2, Check } from "lucide-react";
import { Trophy } from "@/components/Trophy";
import { formatMoney } from "@/lib/countries";

/**
 * The winning-ticket celebration.
 *
 * Shown once per ticket. Which tickets have already been celebrated is kept in
 * browser storage, so a settled win is announced when the player next opens the
 * app and never again after that — a modal that reappears on every visit stops
 * being a celebration and becomes an obstacle.
 */

const SEEN_KEY = "betlixx-celebrated";

function readSeen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** Records a ticket as celebrated. Returns true if this is the first time. */
export function markCelebrated(code: string): boolean {
  try {
    const seen = readSeen();
    if (seen.includes(code)) return false;
    // Keep the list bounded; nobody needs a celebration history.
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, code].slice(-200)));
    return true;
  } catch {
    return false;
  }
}

export function hasCelebrated(code: string): boolean {
  return readSeen().includes(code);
}

/**
 * Confetti, fixed rather than random: a list generated at render time would not
 * survive hydration, and a win screen that flickers on load is worse than one
 * with a repeating pattern nobody will study.
 */
const CONFETTI = [
  { left: 6, delay: 0, dur: 3.2, drift: 30, color: "#93C738" },
  { left: 14, delay: 0.9, dur: 4.1, drift: -24, color: "#FABD2E" },
  { left: 22, delay: 0.35, dur: 3.6, drift: 18, color: "#FFFFFF" },
  { left: 31, delay: 1.6, dur: 4.4, drift: -34, color: "#93C738" },
  { left: 39, delay: 0.15, dur: 3.9, drift: 26, color: "#FF5252" },
  { left: 47, delay: 2.1, dur: 3.4, drift: -16, color: "#93C738" },
  { left: 55, delay: 0.6, dur: 4.6, drift: 34, color: "#FFFFFF" },
  { left: 63, delay: 1.2, dur: 3.3, drift: -28, color: "#FABD2E" },
  { left: 71, delay: 2.4, dur: 4.0, drift: 20, color: "#93C738" },
  { left: 79, delay: 0.45, dur: 3.7, drift: -22, color: "#FF5252" },
  { left: 87, delay: 1.85, dur: 4.3, drift: 30, color: "#FFFFFF" },
  { left: 94, delay: 1.05, dur: 3.5, drift: -18, color: "#93C738" },
];

export function WinCelebration({
  code,
  amount,
  currency,
  onClose,
}: {
  code: string;
  amount: number;
  currency: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const share = async () => {
    const text = `I just won ${formatMoney(amount, currency)} on Velora. Ticket ${code}.`;
    const url = typeof window !== "undefined" ? window.location.origin : "";

    if (navigator.share) {
      try {
        await navigator.share({ title: "Velora win", text, url });
        return;
      } catch {
        /* dismissed */
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center px-6"
      role="dialog"
      aria-modal="true"
      aria-label={`You won ${formatMoney(amount, currency)}`}
    >
      <button className="absolute inset-0 bg-black/85" onClick={onClose} aria-label="Close" />

      {/* Falling colour. Decoration only, so it never eats a tap. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {CONFETTI.map((c, i) => (
          <span
            key={i}
            className="confetti-piece"
            style={{
              left: `${c.left}%`,
              background: c.color,
              animationDelay: `${c.delay}s`,
              animationDuration: `${c.dur}s`,
              ["--drift" as string]: `${c.drift}px`,
            }}
          />
        ))}
      </div>

      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 z-10 text-white/80"
      >
        <X size={26} strokeWidth={2} />
      </button>

      <div className="relative flex w-full max-w-sm flex-col items-center">
        <p className="win-line text-[40px] font-black leading-none tracking-tight text-white">YOU WON</p>
        <p
          className="win-line mt-2 text-[30px] font-black leading-none text-[var(--accent)]"
          style={{ animationDelay: "0.12s" }}
        >
          {formatMoney(amount, currency)}
        </p>

        {/* Two wrappers: one throws the cup up, the other keeps it breathing. */}
        <div className="win-cup mt-2">
          <div className="win-cup-float">
            <Trophy animated size={230} className="drop-shadow-[0_0_28px_rgba(255,82,82,0.35)]" />
          </div>
        </div>

        <p className="win-line -mt-2 text-[13px] text-white/70" style={{ animationDelay: "0.75s" }}>
          Ticket:{" "}
          <span className="font-bold tracking-wider text-[var(--accent)]">{code}</span>
        </p>

        <div className="win-line mt-6 grid w-full grid-cols-2 gap-3" style={{ animationDelay: "0.85s" }}>
          <Link
            href={`/my-bets/${code}`}
            onClick={onClose}
            className="rounded-[4px] py-3 text-center text-[15px] font-bold text-[var(--accent)] ring-1 ring-[var(--accent)]"
          >
            Details
          </Link>
          <button
            onClick={share}
            className="flex items-center justify-center gap-2 rounded-[4px] bg-[var(--accent)] py-3 text-[15px] font-black text-[var(--accent-ink)]"
          >
            {copied ? <Check size={16} strokeWidth={2.6} /> : <Share2 size={16} strokeWidth={2.2} />}
            {copied ? "Copied" : "Show Off"}
          </button>
        </div>
      </div>
    </div>
  );
}
