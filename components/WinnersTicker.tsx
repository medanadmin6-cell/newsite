"use client";

import { useEffect, useState } from "react";

/**
 * The winners ticker.
 *
 * This is a marketing prop, not a feed of real settled tickets: the numbers and
 * amounts are generated. It is labelled as such in the README's Known gaps, and
 * it deliberately does not read from the bets table.
 */

const PREFIXES = ["024", "054", "055", "059", "020", "026", "027"];
const CURRENCIES = ["GH₵", "₦", "KSh"];

function maskedNumber(seed: number): string {
  const prefix = PREFIXES[seed % PREFIXES.length];
  return `${prefix}****${String(100 + (seed % 900)).slice(0, 3)}`;
}

function generate(count: number) {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const seed = Math.floor(now / 60_000) + i * 7919;
    const currency = CURRENCIES[seed % CURRENCIES.length];
    const amount = 50 + ((seed * 37) % 9500);
    return {
      id: `${seed}`,
      number: maskedNumber(seed),
      amount: `${currency}${amount.toLocaleString()}`,
    };
  });
}

export function WinnersTicker() {
  const [items, setItems] = useState(() => generate(8));
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => {
        const next = i + 1;
        if (next >= items.length) {
          setItems(generate(8));
          return 0;
        }
        return next;
      });
    }, 3500);
    return () => clearInterval(timer);
  }, [items.length]);

  const current = items[index];
  if (!current) return null;

  return (
    <div className="flex items-center gap-2 overflow-hidden rounded bg-[var(--surface)] px-3 py-2">
      <span className="shrink-0 rounded-sm bg-[var(--accent)] px-1.5 py-0.5 text-[9px] font-black uppercase text-[var(--accent-ink)]">
        Winner
      </span>
      <p key={current.id} className="truncate text-[12px] text-[var(--text-muted)]">
        <span className="font-semibold text-[var(--text)]">{current.number}</span> just won{" "}
        <span className="font-bold text-[var(--accent-soft)]">{current.amount}</span>
      </p>
    </div>
  );
}
