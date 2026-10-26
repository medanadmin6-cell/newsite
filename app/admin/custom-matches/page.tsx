"use client";

import { useState } from "react";
import Image from "next/image";
import { useAdminData, adminAction, Panel, Table, Badge, Button } from "@/components/admin/ui";
import { useDialog, validators } from "@/components/admin/Dialog";
import { GoalTimeline, type Goal } from "@/components/admin/GoalTimeline";
import { CrestPicker } from "@/components/admin/CrestPicker";

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
  league: "3btafric Special",
  kickoff: "",
  odds_home: 2.0,
  odds_draw: 3.2,
  odds_away: 3.5,
  best_odds: false,
  goal_timeline: [] as Goal[],
  home_crest: null as string | null,
  away_crest: null as string | null,
};

export default function CustomMatchesPage() {
  const { data, error, reload, busy } = useAdminData<{ matches: CustomMatch[] }>(
    "/api/admin/custom-matches",
  );
  const [form, setForm] = useState(BLANK);
  const [note, setNote] = useState<string | null>(null);
  const { ask, confirm, dialog } = useDialog();
  // The match whose goal script is open, if any.
  const [scripting, setScripting] = useState<CustomMatch | null>(null);
  // The same editor, opened for the match being created.
  const [scriptingNew, setScriptingNew] = useState(false);
  const [crestsFor, setCrestsFor] = useState<CustomMatch | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await adminAction("/api/admin/custom-matches", "POST", {
      ...form,
      kickoff: new Date(form.kickoff).toISOString(),
    });
    setNote(res.ok ? "Match created." : (res.error ?? "Failed"));
    if (res.ok) {
      setForm(BLANK);
      reload();
    }
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    const res = await adminAction("/api/admin/custom-matches", "PATCH", { id, ...body });
    setNote(res.ok ? "Updated." : (res.error ?? "Failed"));
    if (res.ok) reload();
  };

  const setResult = async (m: CustomMatch) => {
    const values = await ask({
      title: "Finalise the result",
      description:
        `${m.home_team} v ${m.away_team}. This ends the match now and overrides the goal timeline. ` +
        "Only needed to close a match early — otherwise the clock finishes it by itself.",
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

    const res = await adminAction(`/api/admin/custom-matches?id=${m.id}`, "DELETE");
    setNote(res.ok ? "Deleted." : (res.error ?? "Failed"));
    if (res.ok) reload();
  };

  return (
    <div className="space-y-3">
      {note && <p className="text-[12px] text-[var(--text-muted)]">{note}</p>}
      {error && <p className="text-[13px] text-[var(--lose)]">{error}</p>}

      <Panel title="Create a match">
        <form onSubmit={create} className="grid gap-2 p-3 sm:grid-cols-4">
          <Input placeholder="Home team" value={form.home_team} onChange={(v) => setForm({ ...form, home_team: v })} required />
          <Input placeholder="Away team" value={form.away_team} onChange={(v) => setForm({ ...form, away_team: v })} required />
          <Input placeholder="League" value={form.league} onChange={(v) => setForm({ ...form, league: v })} />
          <input
            type="datetime-local"
            value={form.kickoff}
            onChange={(e) => setForm({ ...form, kickoff: e.target.value })}
            required
            className="rounded bg-[var(--surface-2)] px-2.5 py-2 text-[12px] outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
          <Input placeholder="Home odds" type="number" value={String(form.odds_home)} onChange={(v) => setForm({ ...form, odds_home: Number(v) })} />
          <Input placeholder="Draw odds" type="number" value={String(form.odds_draw)} onChange={(v) => setForm({ ...form, odds_draw: Number(v) })} />
          <Input placeholder="Away odds" type="number" value={String(form.odds_away)} onChange={(v) => setForm({ ...form, odds_away: Number(v) })} />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold">
              <input
                type="checkbox"
                checked={form.best_odds}
                onChange={(e) => setForm({ ...form, best_odds: e.target.checked })}
              />
              Best odds
            </label>
            <Button
              type="button"
              onClick={() => setScriptingNew(true)}
              disabled={!form.home_team.trim() || !form.away_team.trim()}
            >
              Goals ({form.goal_timeline.length})
            </Button>
            <Button tone="accent" type="submit">
              Create
            </Button>
          </div>

          <div className="grid gap-2 sm:col-span-4 sm:grid-cols-2">
            <CrestPicker
              label={`${form.home_team || "Home"} crest`}
              value={form.home_crest}
              onChange={(url) => setForm({ ...form, home_crest: url })}
            />
            <CrestPicker
              label={`${form.away_team || "Away"} crest`}
              value={form.away_crest}
              onChange={(url) => setForm({ ...form, away_crest: url })}
            />
          </div>
        </form>
      </Panel>

      <Panel title={`Custom matches${data ? ` (${data.matches.length})` : ""}`}>
        {busy && !data ? (
          <p className="p-6 text-[13px] text-[var(--text-muted)]">Loading…</p>
        ) : (
          <Table head={["Match", "Kickoff", "Odds", "Goals", "State", "Actions"]}>
            {(data?.matches ?? []).map((m) => (
              <tr key={m.id}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <RowCrest src={m.home_crest} />
                    <RowCrest src={m.away_crest} />
                    <div>
                      <p className="font-semibold">
                        {m.home_team} v {m.away_team}
                      </p>
                      <p className="text-[11px] text-[var(--text-faint)]">{m.league}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-[11px]">{new Date(m.kickoff).toLocaleString()}</td>
                <td className="px-3 py-2 font-mono text-[11px]">
                  {Number(m.odds_home).toFixed(2)} / {Number(m.odds_draw).toFixed(2)} /{" "}
                  {Number(m.odds_away).toFixed(2)}
                </td>
                <td className="px-3 py-2 text-[11px] text-[var(--text-muted)]">
                  {(m.goal_timeline ?? []).length
                    ? m.goal_timeline.map((g) => `${g.minute}'${g.team === "home" ? "H" : "A"}`).join(" ")
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {m.finished ? (
                      <Badge tone="muted">
                        FT {m.final_home}-{m.final_away}
                      </Badge>
                    ) : m.is_live ? (
                      <Badge tone="lose">Live</Badge>
                    ) : (
                      <Badge tone="pending">Upcoming</Badge>
                    )}
                    {m.is_locked && <Badge tone="muted">Locked</Badge>}
                    {m.best_odds && <Badge tone="win">Boost</Badge>}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    <Button onClick={() => setScripting(m)}>
                      Goals ({(m.goal_timeline ?? []).length})
                    </Button>
                    <Button onClick={() => setCrestsFor(m)}>Crests</Button>
                    <Button onClick={() => patch(m.id, { is_live: !m.is_live })}>
                      {m.is_live ? "End live" : "Go live"}
                    </Button>
                    <Button onClick={() => patch(m.id, { is_locked: !m.is_locked })}>
                      {m.is_locked ? "Unlock" : "Lock"}
                    </Button>
                    <Button onClick={() => patch(m.id, { best_odds: !m.best_odds })}>Boost</Button>
                    <Button onClick={() => setResult(m)}>Finalise</Button>
                    <Button tone="danger" onClick={() => remove(m)}>
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
      {crestsFor && (
        <CrestDialog
          match={crestsFor}
          onClose={() => setCrestsFor(null)}
          onSave={async (home, away) => {
            const id = crestsFor.id;
            setCrestsFor(null);
            await patch(id, { home_crest: home, away_crest: away });
          }}
        />
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
    </div>
  );
}

function RowCrest({ src }: { src: string | null }) {
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

/** Both crests for one match, edited together. */
function CrestDialog({
  match,
  onClose,
  onSave,
}: {
  match: CustomMatch;
  onClose: () => void;
  onSave: (home: string | null, away: string | null) => void;
}) {
  const [home, setHome] = useState<string | null>(match.home_crest);
  const [away, setAway] = useState<string | null>(match.away_crest);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-black/70" onClick={onClose} aria-label="Cancel" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Team crests"
        className="relative w-full max-w-md overflow-hidden rounded-[6px] bg-[var(--bg-elevated)] shadow-2xl ring-1 ring-[var(--line)]"
      >
        <header className="border-b border-[var(--line)] px-4 py-3">
          <h2 className="text-[14px] font-bold">Team crests</h2>
          <p className="text-[11px] text-[var(--text-muted)]">
            {match.home_team} v {match.away_team}
          </p>
        </header>

        <div className="space-y-2 p-4">
          <CrestPicker label={`${match.home_team} crest`} value={home} onChange={setHome} />
          <CrestPicker label={`${match.away_team} crest`} value={away} onChange={setAway} />
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--line)] p-3">
          <button
            onClick={onClose}
            className="rounded-[3px] px-4 py-2 text-[12px] font-bold text-[var(--text-muted)] ring-1 ring-[var(--line)]"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(home, away)}
            className="rounded-[3px] bg-[var(--accent)] px-4 py-2 text-[12px] font-black text-[var(--accent-ink)]"
          >
            Save crests
          </button>
        </div>
      </div>
    </div>
  );
}

function Input({
  value,
  onChange,
  ...props
}: {
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <input
      {...props}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded bg-[var(--surface-2)] px-2.5 py-2 text-[12px] outline-none focus:ring-1 focus:ring-[var(--accent)]"
    />
  );
}
