import Link from "next/link";
import { Page } from "@/components/Shell";

/** Games lobby. Instant virtuals is the one that plays. */
export default function GamesPage() {
  return (
    <Page>
      <div className="px-3 pt-3">
        <h1 className="text-[20px] font-black">Games</h1>
        <Link href="/virtuals" className="mt-3 block overflow-hidden rounded-3xl bg-[#0c3b22] p-5 text-white">
          <p className="text-[11px] font-black tracking-[0.14em] text-white/70">PLAY NOW</p>
          <p className="mt-1 text-[22px] font-black">Instant Virtuals</p>
          <p className="mt-1 text-[13px] text-white/75">A league board of instant matches. Price a few, then kick the round off.</p>
          <span className="mt-4 inline-block rounded-full bg-white px-4 py-2 text-[13px] font-black text-[#0c3b22]">
            Play
          </span>
        </Link>
      </div>
    </Page>
  );
}
