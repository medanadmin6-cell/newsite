"use client";

import { useState } from "react";
import { MessageCircle, X, ArrowLeft } from "lucide-react";

/**
 * The in-app support assistant.
 *
 * It answers from a fixed script. It is not connected to a person or a model,
 * which is recorded in the README's Known gaps — so every answer ends somewhere
 * a real human can be reached.
 */

const SCRIPT: { q: string; a: string }[] = [
  {
    q: "How do I deposit?",
    a: "Open Deposit, enter the amount and your mobile money number, then approve the prompt on your phone. If your market uses the manual rail, send to the displayed number and upload a screenshot — our team confirms it shortly after.",
  },
  {
    q: "My deposit has not shown up",
    a: "Open your Account screen — that alone re-checks any payment that completed while you were away. If it is a manual deposit it stays pending until our team confirms it. Still stuck after 15 minutes? Message us on WhatsApp.",
  },
  {
    q: "How does the welcome bonus work?",
    a: "Your first confirmed deposit gets a one-time bonus credited straight to your balance. It is a gift — it does not count toward unlocking withdrawals.",
  },
  {
    q: "What is a booking code?",
    a: "Tap Book on your slip instead of Place bet. You get a short code that anyone can load to get the same selections. Codes last 48 hours.",
  },
  {
    q: "When do my bets settle?",
    a: "As soon as the match finishes — usually within about half a minute. If a leg cannot be judged automatically it stays pending for our team rather than being guessed at.",
  },
];

export function SupportChat() {
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState<number | null>(null);
  const whatsapp = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-[136px] right-3 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-bright)] shadow-lg ring-1 ring-[var(--line)]"
        aria-label="Open support"
      >
        <MessageCircle size={21} strokeWidth={1.8} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-[136px] right-3 z-20 flex max-h-[60vh] w-[min(20rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl bg-[var(--bg-elevated)] shadow-2xl ring-1 ring-[var(--line)]">
      <header className="flex items-center justify-between bg-[var(--surface)] px-3 py-2.5">
        <div>
          <p className="text-[13px] font-bold">Betvanta help</p>
          <p className="text-[10px] text-[var(--text-faint)]">Common questions</p>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Close support" className="text-[var(--text-muted)]">
          <X size={18} strokeWidth={2} />
        </button>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {asked === null ? (
          SCRIPT.map((item, i) => (
            <button
              key={item.q}
              onClick={() => setAsked(i)}
              className="w-full rounded bg-[var(--surface-2)] px-3 py-2 text-left text-[12px] font-medium"
            >
              {item.q}
            </button>
          ))
        ) : (
          <>
            <p className="ml-auto w-fit max-w-[85%] rounded-lg bg-[var(--accent)] px-3 py-2 text-[12px] font-semibold text-[var(--accent-ink)]">
              {SCRIPT[asked].q}
            </p>
            <p className="w-fit max-w-[90%] rounded-lg bg-[var(--surface-2)] px-3 py-2 text-[12px] leading-relaxed">
              {SCRIPT[asked].a}
            </p>
            <button
              onClick={() => setAsked(null)}
              className="flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)]"
            >
              <ArrowLeft size={12} strokeWidth={2.2} />
              Other questions
            </button>
          </>
        )}
      </div>

      {whatsapp && (
        <a
          href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="border-t border-[var(--line)] py-2.5 text-center text-[12px] font-bold text-[var(--accent)]"
        >
          Chat with a person on WhatsApp
        </a>
      )}
    </div>
  );
}
