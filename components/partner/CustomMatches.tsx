"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { CrestPicker } from "@/components/admin/CrestPicker";
import { GoalTimeline, type Goal } from "@/components/admin/GoalTimeline";
import { useDialog, validators } from "@/components/admin/Dialog";

interface CustomMatch {
  id: string;
  home_team: string;
  away_team: string;
  home_crest: string | null;
  away_crest: string | null;
  league: string;
  kickoff: string;
  odds_home: number;
  odds_draw: number;
  odds_away: number;
  goal_timeline: Goal[];
  is_live: boolean;
  is_locked: boolean;
  best_odds: boolean;
  final_home: number | null;
  final_away: number | null;
  finished: boolean;
}

const BLANK = {
  home_team: "",
  away_team: "",
  league: "Betvanta Special",
  kickoff: "",
  odds_home: "2.00",
  odds_draw: "3.20",
  odds_away: "3.50",
  best_odds: false,
  goal_timeline: [] as Goal[],
  home_crest: null as string | null,
  away_crest: null as string | null,
};

/** The same fixture tools the operator has, limited to this partner's matches. */
export function CustomMatches({ approved }: { approved: boolean }) {
  const [matches, setMatches] = useState<CustomMatch[]>([]);
  const [form, setForm] = useState(BLANK);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scriptingNew, setScriptingNew] = useState(false);
  const [scripting, setScripting] = useState<CustomMatch | null>(null);
  const { ask, confirm, dialog } = useDialog();

  const load = useCallback(async () => {
    if (!approved) return;
    const res = await fetch("/api/partner/matches");
    const json = await res.json().catch(() => null);
    if (res.ok) setMatches(json?.matches ?? []);
    else setNote(json?.error ?? "Could not load matches");
  }, [approved]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!approved) return;
      const res = await fetch("/api/partner/matches");
      const json = await res.json().catch(() => null);
      if (!alive) return;
      if (res.ok) setMatches(json?.matches ?? []);
      else setNote(json?.error ?? "Could not load matches");
    })();
    return () => {
      alive = false;
    };
  }, [approved]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/partner/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        odds_home: Number(form.odds_home),
        odds_draw: Number(form.odds_draw),
        odds_away: Number(form.odds_away),
        kickoff: new Date(form.kickoff).toISOString(),
      }),
    });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setNote(json?.error ?? "Could not create the match");
      return;
    }
    setForm(BLANK);
    setNote("Match created.");
    load();
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch("/api/partner/matches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    const json = await res.json().catch(() => null);
    setNote(res.ok ? "Updated." : (json?.error ?? "Could not update the match"));
    if (res.ok) load();
  };

  const setResult = async (m: CustomMatch) => {
    const values = await ask({
      title: "Finalise the result",
      description: `${m.home_team} v ${m.away_team}. This ends the match now and overrides the goal timeline.`,
      fields: [
        {
          name: "score",
          label: "Final score",
          placeholder: "2-1",
          hint: "Home first.",
          validate: validators.scoreline,
        },
      ],
      confirmLabel: "Finalise",
    });
    if (!values) return;
    const [h, a] = values.score.split("-").map((x) => Number(x.trim()));
    await patch(m.id, { final_home: h, final_away: a });
  };

  const remove = async (m: CustomMatch) => {
    const ok = await confirm({
      title: "Delete this match?",
      description: `${m.home_team} v ${m.away_team} is removed from the board. Tickets already placed on it are not refunded automatically.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    const res = await fetch(`/api/partner/matches?id=${m.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => null);
    setNote(res.ok ? "Deleted." : (json?.error ?? "Could not delete the match"));
    if (res.ok) load();
  };

  return (
    <section className="overflow-hidden rounded bg-[var(--bg-elevated)]">
      <h2 className="border-b border-[var(--line)] px-4 py-2.5 text-[13px] font-bold">Custom matches</h2>

      {!approved ? (
        <p className="p-4 text-[12px] text-[var(--text-muted)]">
          You can create matches once the operator approves your account.
        </p>
      ) : (
        <>
          <form onSubmit={create} className="grid gap-2 p-4 sm:grid-cols-2">
            <input
              required
              placeholder="Home team"
              value={form.home_team}
              onChange={(e) => setForm({ ...form, home_team: e.target.value })}
              className={field}
            />
            <input
              required
              placeholder="Away team"
              value={form.away_team}
              onChange={(e) => setForm({ ...form, away_team: e.target.value })}
              className={field}
            />
            <input
              placeholder="League"
              value={form.league}
              onChange={(e) => setForm({ ...form, league: e.target.value })}
              className={field}
            />
            <input
              required
              type="datetime-local"
              value={form.kickoff}
              onChange={(e) => setForm({ ...form, kickoff: e.target.value })}
              className={field}
            />
            <input
              placeholder="Home odds"
              inputMode="decimal"
              value={form.odds_home}
              onChange={(e) => setForm({ ...form, odds_home: e.target.value })}
              className={field}
            />
            <input
              placeholder="Draw odds"
              inputMode="decimal"
              value={form.odds_draw}
              onChange={(e) => setForm({ ...form, odds_draw: e.target.value })}
              className={field}
            />
            <input
              placeholder="Away odds"
              inputMode="decimal"
              value={form.odds_away}
              onChange={(e) => setForm({ ...form, odds_away: e.target.value })}
              className={field}
            />
            <label className="flex items-center gap-2 text-[12px] font-semibold">
              <input
                type="checkbox"
                checked={form.best_odds}
                onChange={(e) => setForm({ ...form, best_odds: e.target.checked })}
              />
              Best odds
            </label>
            <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
              <CrestPicker
                label={`${form.home_team || "Home"} crest`}
                value={form.home_crest}
                onChange={(url) => setForm({ ...form, home_crest: url })}
                uploadUrl="/api/partner/upload"
              />
              <CrestPicker
                label={`${form.away_team || "Away"} crest`}
                value={form.away_crest}
                onChange={(url) => setForm({ ...form, away_crest: url })}
                uploadUrl="/api/partner/upload"
              />
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button
                type="button"
                disabled={!form.home_team.trim() || !form.away_team.trim()}
                onClick={() => setScriptingNew(true)}
                className="rounded bg-[var(--surface-2)] px-3 py-2 text-[12px] font-bold disabled:opacity-50"
              >
                Goals ({form.goal_timeline.length})
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded bg-[var(--accent)] px-4 py-2 text-[12px] font-black text-[var(--accent-ink)] disabled:opacity-50"
              >
                {busy ? "Creating…" : "Create match"}
              </button>
            </div>
            {note && <p className="text-[12px] text-[var(--text-muted)] sm:col-span-2">{note}</p>}
          </form>

          <ul className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
            {!matches.length ? (
              <li className="p-6 text-center text-[13px] text-[var(--text-muted)]">No custom matches yet.</li>
            ) : (
              matches.map((m) => (
                <li key={m.id} className="space-y-2 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Crest src={m.home_crest} />
                    <Crest src={m.away_crest} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold">
                        {m.home_team} v {m.away_team}
                      </p>
                      <p className="text-[11px] text-[var(--text-faint)]">
                        {m.league} · {new Date(m.kickoff).toLocaleString()}
                      </p>
                    </div>
                    <p className="font-mono text-[11px]">
                      {Number(m.odds_home).toFixed(2)} / {Number(m.odds_draw).toFixed(2)} /{" "}
                      {Number(m.odds_away).toFixed(2)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Small onClick={() => setScripting(m)}>Goals ({(m.goal_timeline ?? []).length})</Small>
                    <Small onClick={() => patch(m.id, { is_live: !m.is_live })}>
                      {m.is_live ? "End live" : "Go live"}
                    </Small>
                    <Small onClick={() => patch(m.id, { is_locked: !m.is_locked })}>
                      {m.is_locked ? "Unlock" : "Lock"}
                    </Small>
                    <Small onClick={() => patch(m.id, { best_odds: !m.best_odds })}>Boost</Small>
                    <Small onClick={() => setResult(m)}>
                      {m.finished ? `FT ${m.final_home}-${m.final_away}` : "Finalise"}
                    </Small>
                    <Small danger onClick={() => remove(m)}>
                      Delete
                    </Small>
                  </div>
                </li>
              ))
            )}
          </ul>
        </>
      )}

      {scriptingNew && (
        <GoalTimeline
          homeTeam={form.home_team || "Home"}
          awayTeam={form.away_team || "Away"}
          initial={form.goal_timeline}
          onClose={() => setScriptingNew(false)}
          onSave={(goals) => {
            setForm({ ...form, goal_timeline: goals });
            setScriptingNew(false);
          }}
        />
      )}
      {scripting && (
        <GoalTimeline
          homeTeam={scripting.home_team}
          awayTeam={scripting.away_team}
          initial={scripting.goal_timeline ?? []}
          onClose={() => setScripting(null)}
          onSave={async (goals) => {
            const id = scripting.id;
            setScripting(null);
            await patch(id, { goal_timeline: goals });
          }}
        />
      )}
      {dialog}
    </section>
  );
}

function Crest({ src }: { src: string | null }) {
  return (
    <Image
      src={src || "/crest-fallback.svg"}
      alt=""
      width={20}
      height={20}
      className="h-5 w-5 shrink-0 object-contain"
      unoptimized
    />
  );
}

function Small({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-bold"
      style={danger ? { color: "var(--lose)" } : undefined}
    >
      {children}
    </button>
  );
}

const field =
  "w-full rounded bg-[var(--surface-2)] px-3 py-2.5 text-[13px] outline-none focus:ring-1 focus:ring-[var(--accent)]";
