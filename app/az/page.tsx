"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Page } from "@/components/Shell";
import type { FeedMatch } from "@/lib/fixtures";

/** Every competition on the board, grouped by country. */
export default function AzMenuPage() {
  const [feed, setFeed] = useState<FeedMatch[] | null>(null);

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

  const byCountry = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const m of feed ?? []) {
      const leagues = map.get(m.country) ?? new Map<string, number>();
      leagues.set(m.league, (leagues.get(m.league) ?? 0) + 1);
      map.set(m.country, leagues);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [feed]);

  return (
    <Page>
      <h1 className="px-3 py-3 text-[15px] font-black md:px-5 md:text-[17px]">A-Z Menu</h1>

      {feed === null ? (
        <p className="p-8 text-center text-[13px] text-[var(--text-muted)]">Loading…</p>
      ) : !byCountry.length ? (
        <p className="p-8 text-center text-[13px] text-[var(--text-muted)]">
          Nothing on the board right now.
        </p>
      ) : (
        <div className="space-y-2 px-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 md:px-5 lg:grid-cols-3">
          {byCountry.map(([country, leagues]) => (
            <section key={country} className="overflow-hidden rounded-[6px] bg-[var(--bg-elevated)]">
              <h2 className="bg-[var(--surface)] px-3 py-2 text-[12px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                {country}
              </h2>
              <ul className="divide-y divide-[var(--line)]">
                {[...leagues.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([league, count]) => (
                    <li key={league}>
                      <Link
                        href={`/search?q=${encodeURIComponent(league)}`}
                        className="flex items-center justify-between px-3 py-2.5 text-[13px]"
                      >
                        <span>{league}</span>
                        <span className="text-[11px] text-[var(--text-faint)]">{count}</span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}
