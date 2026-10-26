"use client";

import { useEffect, useState } from "react";
import { useAdminData, adminAction, Panel, Table, Badge, Button } from "@/components/admin/ui";
import { useDialog, validators } from "@/components/admin/Dialog";
import type { FeedMatch } from "@/lib/fixtures";

interface Override {
  match_id: string;
  score_home: number | null;
  score_away: number | null;
  minute: number | null;
  is_live: boolean | null;
  is_locked: boolean | null;
  postponed: boolean | null;
}

/**
 * Upstream fixtures with the override controls.
 *
 * Settlement does not need anything from this screen: a finished match is
 * judged off the real result pulled from the feed. An override exists for the
 * cases where that result is wrong, missing, or the fixture was postponed —
 * and it then takes precedence.
 */
export default function MatchesPage() {
  const { data, error, reload } = useAdminData<{ overrides: Override[] }>("/api/admin/matches");
  const [feed, setFeed] = useState<FeedMatch[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { ask, dialog } = useDialog();

  useEffect(() => {
    fetch("/api/fixtures")
      .then((r) => (r.ok ? r.json() : { matches: [] }))
      .then((j) => setFeed((j.matches ?? []).filter((m: FeedMatch) => m.source === "api")))
      .catch(() => setFeed([]));
  }, []);

  const byId = new Map((data?.overrides ?? []).map((o) => [o.match_id, o]));

  const save = async (matchId: string, patch: Partial<Override>) => {
    const existing = byId.get(matchId) ?? {};
    const res = await adminAction("/api/admin/matches", "PUT", {
      ...existing,
      match_id: matchId,
      ...patch,
    });
    setNote(res.ok ? "Override saved." : (res.error ?? "Failed"));
    if (res.ok) reload();
  };

  const clear = async (matchId: string) => {
    const res = await adminAction(`/api/admin/matches?match_id=${matchId}`, "DELETE");
    setNote(res.ok ? "Override cleared." : (res.error ?? "Failed"));
    if (res.ok) reload();
  };

  const setScore = async (m: FeedMatch) => {
    const values = await ask({
      title: "Override the score",
      description:
        `${m.homeTeam} v ${m.awayTeam}. Only needed when the upstream result is wrong or missing — ` +
        "finished matches settle on their own from the live result.",
      fields: [
        {
          name: "score",
          label: "Final score",
          placeholder: "2-1",
          hint: "Home first. This is what settlement will judge on.",
          validate: validators.scoreline,
        },
      ],
      confirmLabel: "Override",
    });
    if (!values) return;

    const [h, a] = values.score.split("-").map((x) => Number(x.trim()));
    await save(m.id, { score_home: h, score_away: a, is_live: false });
  };

  const setMinute = async (m: FeedMatch) => {
    const values = await ask({
      title: "Force the minute",
      description: `${m.homeTeam} v ${m.awayTeam}`,
      fields: [
        {
          name: "minute",
          label: "Minute",
          placeholder: "67",
          validate: validators.integer(0, 130),
        },
      ],
    });
    if (!values) return;
    await save(m.id, { minute: Number(values.minute) });
  };

  const shown = (feed ?? []).filter((m) =>
    search
      ? `${m.homeTeam} ${m.awayTeam} ${m.league}`.toLowerCase().includes(search.toLowerCase())
      : true,
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search fixtures"
          className="w-64 rounded bg-[var(--surface-2)] px-3 py-1.5 text-[12px] outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
        <p className="text-[11px] text-[var(--text-faint)]">
          Finished matches settle themselves from the live result. Override only when it is wrong.
        </p>
      </div>

      {note && <p className="text-[12px] text-[var(--text-muted)]">{note}</p>}
      {error && <p className="text-[13px] text-[var(--lose)]">{error}</p>}

      <Panel title={`Upstream fixtures${feed ? ` (${shown.length})` : ""}`}>
        {feed === null ? (
          <p className="p-6 text-[13px] text-[var(--text-muted)]">Loading the feed…</p>
        ) : !shown.length ? (
          <p className="p-8 text-center text-[13px] text-[var(--text-muted)]">
            No upstream fixtures. Set API_FOOTBALL_KEY to pull them in.
          </p>
        ) : (
          <Table head={["Fixture", "League", "Feed", "Override", "Actions"]}>
            {shown.map((m) => {
              const o = byId.get(m.id);
              return (
                <tr key={m.id}>
                  <td className="px-3 py-2">
                    <p className="font-semibold">
                      {m.homeTeam} v {m.awayTeam}
                    </p>
                    <p className="text-[11px] text-[var(--text-faint)]">
                      {new Date(m.kickoff).toLocaleString()}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-[var(--text-muted)]">{m.league}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      {m.isLive && <Badge tone="lose">{m.minuteLabel}</Badge>}
                      <span className="text-[11px]">
                        {m.scoreHome ?? "-"} : {m.scoreAway ?? "-"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {o ? (
                      <div className="flex flex-wrap gap-1">
                        {o.score_home != null && (
                          <Badge tone="win">
                            {o.score_home}-{o.score_away}
                          </Badge>
                        )}
                        {o.minute != null && <Badge tone="pending">{o.minute}&apos;</Badge>}
                        {o.is_locked && <Badge tone="muted">Locked</Badge>}
                        {o.postponed && <Badge tone="muted">Postponed</Badge>}
                      </div>
                    ) : (
                      <span className="text-[11px] text-[var(--text-faint)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Button onClick={() => setScore(m)}>Override score</Button>
                      <Button onClick={() => setMinute(m)}>Minute</Button>
                      <Button onClick={() => save(m.id, { is_locked: !o?.is_locked })}>
                        {o?.is_locked ? "Unlock" : "Lock"}
                      </Button>
                      <Button onClick={() => save(m.id, { postponed: !o?.postponed })}>
                        {o?.postponed ? "Un-postpone" : "Postpone"}
                      </Button>
                      {o && (
                        <Button tone="danger" onClick={() => clear(m.id)}>
                          Clear
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>
      {dialog}
    </div>
  );
}
