import Link from "next/link";
import { Page } from "@/components/Shell";
import { TIERS } from "@/lib/tiers";

export const metadata = { title: "How to play | Velora" };

/**
 * The help page the account screen links into.
 *
 * Everything here describes a rule the code actually enforces — the withdrawal
 * gate, the settlement rules, the tier table — rather than marketing copy that
 * could drift away from the platform.
 */
export default function HowToPlayPage() {
  const whatsapp = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP;

  return (
    <Page>
      <div className="px-4 py-4 md:mx-auto md:max-w-2xl md:px-5">
        <h1 className="text-[20px] font-black">How to play</h1>

        <Section title="Placing a bet">
          <p>
            Tap any odds to add a selection to your slip. Every leg multiplies together, so a longer
            ticket pays more but needs every leg to land.
          </p>
          <p>
            The price is re-read from the board when you submit, so a slip left open will never be
            struck at a stale price — if it moved, you are told rather than charged the old one.
          </p>
          <p>
            Tap <strong>Book</strong> instead of Place bet to save the slip under a short code that
            anyone can load. Codes last 48 hours.
          </p>
        </Section>

        <Section title="Deposits">
          <p>
            Deposit by mobile money. Your first confirmed deposit gets a one-time welcome bonus paid
            straight to your balance.
          </p>
          <p>
            If a payment completes while you are away from the app, opening your Account screen
            finds it and credits you. You never need to send a screenshot for an instant deposit.
          </p>
        </Section>

        <Section title="Withdrawals">
          <p>
            Withdrawals unlock after <strong>three separate qualifying deposits</strong> — not one
            large one. Deposits are counted, not added up, so paying the whole amount at once
            unlocks nothing.
          </p>
          <p>
            Your Account screen shows exactly how many you have. Once unlocked, a withdrawal is
            reviewed and paid to your mobile money number.
          </p>
        </Section>

        <Section title="When bets settle" id="settlement">
          <p>
            Match result, goals, corners, handicaps and half-time markets settle automatically as
            soon as the match finishes — usually within about half a minute.
          </p>
          <p>
            Some outcomes cannot be decided automatically. A whole line that lands exactly (over 2
            goals in a 2-goal game) is a push, and a draw on a Draw No Bet is a void. Those are held
            for our team rather than guessed at, so nothing is ever settled against you by mistake.
          </p>
        </Section>

        <Section title="Loyalty tiers" id="loyalty">
          <p>
            You earn one tier point for every unit you stake. Points come from turnover, not from
            deposits — funding an account you never play earns nothing.
          </p>
          <div className="mt-2 overflow-hidden rounded bg-[var(--bg-elevated)]">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
                  <th className="px-3 py-2 font-semibold">Tier</th>
                  <th className="px-3 py-2 font-semibold">Points</th>
                  <th className="px-3 py-2 font-semibold">Reward rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {TIERS.map((t) => (
                  <tr key={t.name}>
                    <td className="px-3 py-2 font-semibold">{t.name}</td>
                    <td className="px-3 py-2">{t.at.toLocaleString()}</td>
                    <td className="px-3 py-2 text-[var(--accent)]">
                      {t.rewardRate ? `${(t.rewardRate * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Customer service" id="support">
          <p>
            The help button on any screen answers the common questions. For anything it cannot
            settle, reach a person:
          </p>
          {whatsapp ? (
            <a
              href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block rounded bg-[var(--accent)] px-5 py-2.5 text-[13px] font-black text-[var(--accent-ink)]"
            >
              Message us on WhatsApp
            </a>
          ) : (
            <p className="text-[var(--text-faint)]">
              A support line is not configured on this deployment yet.
            </p>
          )}
        </Section>

        <Section title="Playing responsibly">
          <p>
            Betting should cost you no more than you are content to lose. It is not a way to make
            money or to recover money already lost.
          </p>
          <p>
            If it stops being enjoyable, stop. You can ask us to close your account at any time from{" "}
            <Link href="/account-status" className="font-medium text-[var(--accent)]">
              account status
            </Link>
            , and we will not ask you to justify it.
          </p>
          <p className="text-[var(--text-faint)]">Over 18s only.</p>
        </Section>
      </div>
    </Page>
  );
}

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-6 scroll-mt-16">
      <h2 className="mb-2 text-[15px] font-bold text-[var(--text-bright)]">{title}</h2>
      <div className="space-y-2 text-[13px] leading-relaxed text-[var(--text-muted)]">{children}</div>
    </section>
  );
}
