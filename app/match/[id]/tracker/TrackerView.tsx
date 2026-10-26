"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw } from "lucide-react";
import type { FeedMatch } from "@/lib/fixtures";
import type { TrackerEvent, TrackerStat } from "@/lib/tracker";
import { PitchTracker } from "@/components/PitchTracker";

const POLL_MS = 20_000;

interface Payload {
  match: FeedMatch | null;
  events: TrackerEvent[];
  stats: TrackerStat[];
}

/**
 * The match tracker.
 *
 * A timeline down the middle with each side's events on their own half, so the
 * shape of a match reads at a glance: who scored, when, and who is in trouble.
 * Statistics are frequently absent from the feed, so they appear only when the
 * numbers actually arrive rather than as a row of dashes.
 */
export function TrackerView({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch(`/api/match/${encodeURIComponent(id)}/tracker`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setError(json.error ?? "Could not load the tracker");
          return;
        }
        setData(json);
        setError(null);
      } catch {
        if (alive) setError("Could not load the tracker");
      }
    })();

    return () => {
      alive = false;
    };
  }, [id, nonce]);

  // Keep it current while the match is running.
  useEffect(() => {
    if (!data?.match?.isLive) return;
    const timer = setInterval(() => setNonce((n) => n + 1), POLL_MS);
    return () => clearInterval(timer);
  }, [data?.match?.isLive]);

  const match = data?.match ?? null;

  // Possession is read from the statistics the feed reports, and is simply
  // absent for most matches in play.
  const possession = (() => {
    const row = data?.stats.find((s) => s.label.toLowerCase().includes("possession"));
    if (!row) return null;
    const num = (v: string | number | null) => Number(String(v ?? "").replace("%", ""));
    const h = num(row.home);
    const a = num(row.away);
    if (!Number.isFinite(h) || !Number.isFinite(a) || h + a === 0) return null;
    return { home: Math.round(h), away: Math.round(a) };
  })();

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="sticky top-0 z-40 bg-[var(--surface)]">
        <div className="mx-auto flex h-[48px] max-w-2xl items-center gap-3 px-4">
          <button onClick={() => router.back()} aria-label="Back" className="text-[var(--text-bright)]">
            <ArrowLeft size={22} strokeWidth={2} />
          </button>
          <h1 className="flex-1 text-[17px] font-bold text-[var(--text-bright)]">Match Tracker</h1>
          <button
            onClick={() => setNonce((n) => n + 1)}
            aria-label="Refresh"
            className="text-[var(--text-muted)]"
          >
            <RefreshCw size={16} strokeWidth={2} />
          </button>
        </div>
      </header>

      {error ? (
        <div className="p-10 text-center">
          <p className="text-[14px] text-[var(--text-muted)]">{error}</p>
          <Link
            href={`/match/${id}`}
            className="mt-4 inline-block rounded bg-[var(--accent)] px-5 py-2.5 text-[13px] font-black text-[var(--accent-ink)]"
          >
            Match details
          </Link>
        </div>
      ) : !data ? (
        <div className="animate-pulse space-y-3 p-4">
          <div className="h-28 rounded bg-[var(--bg-elevated)]" />
          <div className="h-56 rounded bg-[var(--bg-elevated)]" />
        </div>
      ) : (
        <div className="mx-auto max-w-2xl pb-12">
          {match && (
            <>
              <section className="flex items-center justify-between gap-2 bg-[var(--surface)] px-4 py-4">
                <Side name={match.homeTeam} crest={match.homeCrest} />
                <div className="shrink-0 text-center">
                  <p className="text-[12px] text-[var(--text-muted)]">
                    {match.country} - {match.league}
                  </p>
                  <p
                    className="mt-0.5 text-[13px] font-bold"
                    style={{ color: match.isLive ? "var(--live)" : "var(--text-muted)" }}
                  >
                    {match.isLive ? match.minuteLabel : "Not started"}
                  </p>
                </div>
                <Side name={match.awayTeam} crest={match.awayCrest} />
              </section>

              <div className="p-3">
                <PitchTracker
                  events={data.events}
                  homeTeam={match.homeTeam}
                  awayTeam={match.awayTeam}
                  scoreHome={match.scoreHome ?? 0}
                  scoreAway={match.scoreAway ?? 0}
                  minuteLabel={match.minuteLabel}
                  isLive={match.isLive}
                  possession={possession}
                />
              </div>
            </>
          )}

          <h2 className="px-4 pb-2 pt-4 text-[13px] font-bold text-[var(--text-bright)]">Timeline</h2>

          {!data.events.length ? (
            <p className="mx-4 rounded bg-[var(--bg-elevated)] p-8 text-center text-[13px] text-[var(--text-muted)]">
              Nothing has happened yet.
            </p>
          ) : (
            <ol className="relative mx-4">
              {/* The spine the events hang off. */}
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--line)]" />
              {data.events.map((e, i) => (
                <TimelineRow key={`${e.minute}-${i}`} event={e} />
              ))}
            </ol>
          )}

          {/* Statistics, only where the feed actually has them. */}
          {data.stats.length > 0 && (
            <>
              <h2 className="px-4 pb-2 pt-6 text-[13px] font-bold text-[var(--text-bright)]">
                Statistics
              </h2>
              <div className="mx-4 space-y-3 rounded bg-[var(--bg-elevated)] p-4">
                {data.stats.map((s) => (
                  <StatRow key={s.label} stat={s} />
                ))}
              </div>
            </>
          )}

          <div className="px-4 pt-6">
            <Link
              href={`/match/${id}`}
              className="block rounded py-3 text-center text-[13px] font-bold text-[var(--accent)] ring-1 ring-[var(--accent)]"
            >
              Match details and odds
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Side({ name, crest }: { name: string; crest: string | null }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <Image
        src={crest || "/crest-fallback.svg"}
        alt=""
        width={44}
        height={44}
        className="h-11 w-11 object-contain"
        unoptimized
      />
      <span className="line-clamp-2 text-center text-[12px] font-medium leading-tight text-[var(--text)]">
        {name}
      </span>
    </div>
  );
}

const ICON: Record<string, string> = {
  goal: "⚽",
  card: "▮",
  sub: "⇄",
  var: "▣",
  other: "•",
};

function TimelineRow({ event }: { event: TrackerEvent }) {
  const home = event.side === "home";
  const red = event.detail.toLowerCase().includes("red");

  const body = (
    <div
      className="max-w-[46%] rounded bg-[var(--bg-elevated)] px-3 py-2"
      style={{ textAlign: home ? "right" : "left" }}
    >
      <p className="text-[12px] font-semibold text-[var(--text)]">{event.player ?? event.detail}</p>
      {(event.player || event.assist) && (
        <p className="text-[11px] text-[var(--text-muted)]">
          {event.player ? event.detail : ""}
          {event.assist ? ` · ${event.assist}` : ""}
        </p>
      )}
    </div>
  );

  const badge =
    event.kind === "goal"
      ? { background: "var(--accent)", color: "var(--accent-ink)" }
      : event.kind === "card"
        ? red
          ? { background: "var(--lose)", color: "#ffffff" }
          : { background: "var(--pending)", color: "#3f2d03" }
        : { background: "var(--surface-2)", color: "var(--text)" };

  return (
    <li className="relative flex items-center justify-between py-2">
      {home ? body : <span className="max-w-[46%] flex-1" />}

      <span className="z-10 flex shrink-0 flex-col items-center px-2">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
          style={badge}
        >
          {ICON[event.kind] ?? "•"}
        </span>
        <span className="mt-0.5 text-[10px] font-bold text-[var(--text-muted)]">
          {event.minute}
          {event.extra ? `+${event.extra}` : ""}
        </span>
      </span>

      {home ? <span className="max-w-[46%] flex-1" /> : body}
    </li>
  );
}

function StatRow({ stat }: { stat: TrackerStat }) {
  const toNumber = (v: string | number | null): number => {
    if (v === null) return 0;
    const n = Number(String(v).replace("%", ""));
    return Number.isFinite(n) ? n : 0;
  };

  const h = toNumber(stat.home);
  const a = toNumber(stat.away);
  const total = h + a;
  const share = total > 0 ? (h / total) * 100 : 50;

  return (
    <div>
      <div className="flex items-center justify-between text-[12px]">
        <span className="font-bold text-[var(--text)]">{stat.home ?? "-"}</span>
        <span className="text-[var(--text-muted)]">{stat.label}</span>
        <span className="font-bold text-[var(--text)]">{stat.away ?? "-"}</span>
      </div>
      <div className="mt-1 flex h-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <span className="h-full bg-[var(--accent)]" style={{ width: `${share}%` }} />
        <span className="h-full bg-[var(--hint)]" style={{ width: `${100 - share}%` }} />
      </div>
    </div>
  );
}
