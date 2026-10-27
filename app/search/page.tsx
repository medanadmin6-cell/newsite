"use client";

import { useEffect, useMemo, useState } from "react";
import { Page } from "@/components/Shell";
import { MatchList } from "@/components/MatchList";
import { BetSlip } from "@/components/BetSlip";
import type { FeedMatch } from "@/lib/fixtures";

/** Search across the merged feed: teams, leagues and countries. */
export default function SearchPage() {
  const [feed, setFeed] = useState<FeedMatch[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/fixtures", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { matches: [] }))
      .then((j) => alive && setFeed(j.matches ?? []))
      .catch(() => alive && setFeed([]));
    return () => {
      alive = false;
    };
  }, []);

  const results = useMemo(() => {
    if (!feed) return null;
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return feed.filter((m) =>
      `${m.homeTeam} ${m.awayTeam} ${m.league} ${m.country}`.toLowerCase().includes(term),
    );
  }, [feed, q]);

  return (
    <Page>
      <div className="px-3 pt-4 md:px-5">
        <h1 className="mb-3 text-[26px] font-black text-[var(--text-bright)]">Search</h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Teams, leagues or countries"
          autoFocus
          className="w-full rounded-2xl bg-white px-4 py-3 text-[14px] shadow-sm outline-none placeholder:text-[var(--text-faint)] focus:ring-2 focus:ring-[var(--accent)] md:mx-auto md:block md:max-w-2xl"
        />
      </div>

      <div className="px-2 md:px-5">
        {!q.trim() ? (
          <p className="p-8 text-center text-[13px] text-[var(--text-muted)]">
            Type to search {feed?.length ?? 0} matches on the board.
          </p>
        ) : (
          <MatchList matches={results} emptyLabel={`Nothing matching "${q}".`} />
        )}
      </div>

      <BetSlip />
    </Page>
  );
}
