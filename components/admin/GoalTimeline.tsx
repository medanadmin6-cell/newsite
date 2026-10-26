"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";

/**
 * The goal script for an operator-created match.
 *
 * The timeline is what the match actually is: the clock reads the minute, the
 * goals up to that minute give the live score, and settlement judges the final
 * score off the same list. So the editor shows the consequences — running
 * score, half-time score, full-time score — rather than asking the operator to
 * hold them in their head.
 */

export interface Goal {
  minute: number;
  team: "home" | "away";
}

const MAX_MINUTE = 120;
const HALF = 45;

export function GoalTimeline({
  homeTeam,
  awayTeam,
  initial,
  onSave,
  onClose,
}: {
  homeTeam: string;
  awayTeam: string;
  initial: Goal[];
  onSave: (goals: Goal[]) => void;
  onClose: () => void;
}) {
  const [goals, setGoals] = useState<Goal[]>(() =>
    [...(initial ?? [])].sort((a, b) => a.minute - b.minute),
  );
  const [minute, setMinute] = useState("");
  const [team, setTeam] = useState<"home" | "away">("home");
  const [error, setError] = useState<string | null>(null);

  /** Running score after each goal, plus the half-time and full-time lines. */
  const view = useMemo(() => {
    let h = 0;
    let a = 0;
    const rows = goals.map((g) => {
      if (g.team === "home") h++;
      else a++;
      return { ...g, home: h, away: a };
    });

    const firstHalf = goals.filter((g) => g.minute <= HALF);
    return {
      rows,
      full: { home: h, away: a },
      half: {
        home: firstHalf.filter((g) => g.team === "home").length,
        away: firstHalf.filter((g) => g.team === "away").length,
      },
    };
  }, [goals]);

  const add = () => {
    const m = Number(minute);
    if (!Number.isInteger(m) || m < 1 || m > MAX_MINUTE) {
      setError(`Enter a minute between 1 and ${MAX_MINUTE}`);
      return;
    }
    setGoals((g) => [...g, { minute: m, team }].sort((x, y) => x.minute - y.minute));
    setMinute("");
    setError(null);
  };

  const removeAt = (i: number) => setGoals((g) => g.filter((_, idx) => idx !== i));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-black/70" onClick={onClose} aria-label="Cancel" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Goal timeline"
        className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-[6px] bg-[var(--bg-elevated)] shadow-2xl ring-1 ring-[var(--line)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div>
            <h2 className="text-[14px] font-bold">Goal timeline</h2>
            <p className="text-[11px] text-[var(--text-muted)]">
              {homeTeam} v {awayTeam}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-[var(--text-muted)]">
            <X size={17} strokeWidth={2} />
          </button>
        </header>

        {/* Add a goal */}
        <div className="border-b border-[var(--line)] p-4">
          <div className="flex items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
                Minute
              </span>
              <input
                type="number"
                min={1}
                max={MAX_MINUTE}
                value={minute}
                onChange={(e) => {
                  setMinute(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                }}
                placeholder="20"
                className="w-20 rounded-[3px] bg-[var(--surface-2)] px-3 py-2 text-[13px] outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
            </label>

            <div className="flex-1">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
                Scored by
              </span>
              <div className="grid grid-cols-2 gap-1">
                {(["home", "away"] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    onClick={() => setTeam(side)}
                    className="truncate rounded-[3px] px-2 py-2 text-[12px] font-bold"
                    style={
                      team === side
                        ? { background: "var(--accent)", color: "var(--accent-ink)" }
                        : { background: "var(--surface-2)", color: "var(--text-muted)" }
                    }
                  >
                    {side === "home" ? homeTeam : awayTeam}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={add}
              aria-label="Add goal"
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[3px] bg-[var(--accent)] text-[var(--accent-ink)]"
            >
              <Plus size={18} strokeWidth={2.6} />
            </button>
          </div>

          {error && <p className="mt-2 text-[11px] text-[var(--lose)]">{error}</p>}
        </div>

        {/* The script */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!view.rows.length ? (
            <p className="p-8 text-center text-[12px] text-[var(--text-muted)]">
              No goals yet — this match finishes 0-0.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {view.rows.map((g, i) => (
                <li key={`${g.minute}-${g.team}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-11 shrink-0 text-[13px] font-bold text-[var(--accent)]">
                    {g.minute}&apos;
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {g.team === "home" ? homeTeam : awayTeam}
                  </span>
                  <span className="shrink-0 text-[13px] font-bold tabular-nums text-[var(--text-muted)]">
                    {g.home}-{g.away}
                  </span>
                  {g.minute <= HALF && (
                    <span className="shrink-0 text-[9px] font-bold text-[var(--text-faint)]">1H</span>
                  )}
                  <button
                    onClick={() => removeAt(i)}
                    aria-label={`Remove the ${g.minute} minute goal`}
                    className="shrink-0 text-[var(--text-faint)]"
                  >
                    <Trash2 size={14} strokeWidth={1.9} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Consequences */}
        <div className="border-t border-[var(--line)] px-4 py-3">
          <div className="flex justify-between text-[12px]">
            <span className="text-[var(--text-muted)]">Half time</span>
            <span className="font-bold tabular-nums">
              {view.half.home} - {view.half.away}
            </span>
          </div>
          <div className="mt-1 flex justify-between text-[13px]">
            <span className="text-[var(--text-muted)]">Full time</span>
            <span className="font-black tabular-nums text-[var(--accent)]">
              {view.full.home} - {view.full.away}
            </span>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-faint)]">
            The clock drives the live score from these minutes, and settlement judges the final
            score off the same list. Half-time markets settle on goals up to {HALF}&apos;.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--line)] p-3">
          <button
            onClick={onClose}
            className="rounded-[3px] px-4 py-2 text-[12px] font-bold text-[var(--text-muted)] ring-1 ring-[var(--line)]"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(goals)}
            className="rounded-[3px] bg-[var(--accent)] px-4 py-2 text-[12px] font-black text-[var(--accent-ink)]"
          >
            Save timeline
          </button>
        </div>
      </div>
    </div>
  );
}
