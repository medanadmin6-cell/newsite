import Link from "next/link";
import { Page } from "@/components/Shell";

/** Games lobby. Instant virtuals is the one that plays. */
export default function GamesPage() {
  return (
    <Page>
      <div className="px-3 pt-4">
        <p className="text-[11px] font-bold tracking-[0.16em] text-[var(--accent)]">PLAY</p>
        <h1 className="text-[26px] font-black text-[var(--text-bright)]">Games</h1>
        <p className="mt-1 max-w-sm text-[13px] text-[var(--text-muted)]">
          One game is open. It uses the same wallet as the rest of Velora.
        </p>
        <Link href="/virtuals" className="mt-4 block rounded-3xl bg-[#0f1c33] p-5 text-white">
          <p className="text-[11px] font-bold tracking-[0.16em] text-white/50">INSTANT FOOTBALL</p>
          <p className="mt-2 text-[22px] font-black leading-tight">A round of matches, settled when you kick off.</p>
          <span className="mt-4 inline-block rounded-full bg-[#2f6bff] px-4 py-2 text-[13px] font-black text-white">
            Open the board
          </span>
        </Link>
      </div>
    </Page>
  );
}
