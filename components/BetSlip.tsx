"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Trash2, Settings, CircleHelp } from "lucide-react";
import { useSlip, useSession, type SlipMode, type SlipLeg } from "@/lib/store";
import { formatMoney } from "@/lib/countries";
import { BallIcon } from "@/components/icons";
import { BookedCode } from "@/components/BookedCode";
import { PlacedReceipt, type PlacedTicket } from "@/components/PlacedReceipt";
import {
  bonusFor,
  bonusAmount,
  combinationCount,
  systemSizes,
  QUALIFYING_ODDS,
} from "@/lib/bonus";

/**
 * The bet slip.
 *
 * Three ways to place the same selections — a single per pick, one multiple, or
 * a system covering every combination of a chosen size — with the accumulator
 * bonus shown on multiples.
 *
 * Every price here is what the client last saw. The server re-prices each leg
 * from the live board on submit, so a stale slip is rejected rather than struck
 * at the wrong number.
 */

const TABS: { key: SlipMode; label: string }[] = [
  { key: "single", label: "Single" },
  { key: "multiple", label: "Multiple" },
  { key: "system", label: "System" },
];

export function BetSlip() {
  const {
    legs,
    stake,
    open,
    mode,
    systemSize,
    acceptOddsChanges,
    setOpen,
    setStake,
    setMode,
    setSystemSize,
    setAcceptOddsChanges,
    remove,
    clear,
    clearLegs,
  } = useSlip();

  const player = useSession((s) => s.player);
  const setBalance = useSession((s) => s.setBalance);
  const addOpenBets = useSession((s) => s.addOpenBets);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Legs the server refused to price because the fixture has gone. Kept so the
  // banner can offer to drop exactly those and leave the rest of the slip.
  const [unavailable, setUnavailable] = useState<string[]>([]);
  // The placed slip keeps the legs it was built from, so the receipt can show
  // the selections back rather than only confirming.
  const [placed, setPlaced] = useState<{
    ticket: PlacedTicket;
    legs: SlipLeg[];
    lines: number;
    totalCost: number;
    oddsChanged: { match: string; from: number; to: number }[];
  } | null>(null);
  const [booked, setBooked] = useState<{ code: string; expiresAt: string | null } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const currency = player?.currency ?? "GHS";
  const oddsPerLeg = useMemo(() => legs.map((l) => l.odds), [legs]);

  // What this slip becomes, and what it costs.
  const maths = useMemo(() => {
    const sizes = systemSizes(legs.length);
    const size = sizes.includes(systemSize) ? systemSize : (sizes[0] ?? 2);

    const lines =
      mode === "single" ? legs.length : mode === "system" ? combinationCount(legs.length, size) : 1;

    const totalOdds = legs.reduce((acc, l) => acc * l.odds, 1);
    const bonus = mode === "multiple" && legs.length >= 2 ? bonusAmount(stake, totalOdds, oddsPerLeg) : 0;

    const win =
      mode === "multiple"
        ? stake * totalOdds + bonus
        : mode === "single"
          ? legs.reduce((acc, l) => acc + stake * l.odds, 0)
          : // A system pays per line; the best case is every combination landing.
            stake * legs.reduce((acc, l) => acc * l.odds, 1);

    return {
      sizes,
      size,
      lines,
      totalOdds: Math.round(totalOdds * 100) / 100,
      bonus,
      win: Math.round(win * 100) / 100,
      cost: Math.round(stake * lines * 100) / 100,
    };
  }, [legs, mode, systemSize, stake, oddsPerLeg]);

  const standing = bonusFor(oddsPerLeg);

  // The server names the dead fixtures by id; the slip is what knows who was
  // playing, so the two are matched up here to name them in the banner.
  const deadLegs = legs.filter((l) => unavailable.includes(l.matchId));

  const place = async () => {
    if (!player) return;
    setBusy(true);
    setError(null);
    setUnavailable([]);
    try {
      const res = await fetch("/api/bets/place", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: player.id,
          stake,
          mode,
          systemSize: maths.size,
          acceptOddsChanges,
          selections: legs.map((l) => ({
            matchId: l.matchId,
            market: l.market,
            outcome: l.outcome,
            odds: l.odds,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not place your bet");
        if (Array.isArray(json.unavailableMatchIds)) {
          setUnavailable(json.unavailableMatchIds.map(String));
        }
        return;
      }
      setPlaced({
        ticket: json.ticket,
        // Captured before the slip is cleared.
        legs: [...legs],
        lines: json.lines,
        totalCost: json.totalCost,
        oddsChanged: json.oddsChanged ?? [],
      });
      if (typeof json.balance === "number") setBalance(json.balance);
      // A system or singles slip becomes several tickets, so the badge moves by
      // the number of lines written, not by one.
      addOpenBets(Number(json.lines) || 1);
      // Empty the slip but leave the sheet open: the receipt is the next thing
      // the player should see, and clear() would close it out from under them.
      clearLegs();
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const book = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: player?.id ?? null, selections: legs, expiresInHours: 48 }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not book your slip");
        return;
      }
      setBooked({ code: json.code, expiresAt: json.expiresAt ?? null });
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-label="Bet slip">
      <button className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} aria-label="Close bet slip" />

      <div className="relative flex max-h-[92vh] w-full flex-col rounded-t-xl bg-[var(--bg-elevated)] pb-[env(safe-area-inset-bottom)] shadow-2xl md:mx-auto md:max-w-2xl">
        {/* Drag handle */}
        <button
          onClick={() => setOpen(false)}
          aria-label="Collapse"
          className="flex w-full justify-center py-2 text-[var(--text-muted)]"
        >
          <ChevronDown size={20} strokeWidth={2.2} />
        </button>

        {placed ? (
          <PlacedReceipt
            ticket={placed.ticket}
            legs={placed.legs}
            lines={placed.lines}
            totalCost={placed.totalCost}
            oddsChanged={placed.oddsChanged}
            onDone={() => {
              setPlaced(null);
              setOpen(false);
            }}
          />
        ) : legs.length === 0 ? (
          <p className="p-12 text-center text-[13px] text-[var(--text-muted)]">
            Tap any odds to add a selection.
          </p>
        ) : (
          <>
            {/* Count, mode badge and balance */}
            <div className="flex items-center gap-2 px-4 pb-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-[13px] font-black text-[var(--accent-ink)]">
                {legs.length}
              </span>
              <span className="rounded-full bg-[var(--surface-2)] p-0.5">
                <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-[11px] font-black text-[var(--accent-ink)]">
                  REAL
                </span>
              </span>
              <span className="ml-auto text-[15px] font-black text-[var(--pending)]">
                {formatMoney(Number(player?.balance ?? 0), currency)}
              </span>
            </div>

            <div className="flex items-center justify-between px-4 pb-3">
              <button
                onClick={clear}
                className="flex items-center gap-1.5 text-[13px] text-[var(--text-muted)]"
              >
                <Trash2 size={15} strokeWidth={1.9} />
                Remove All
              </button>
              <button
                onClick={() => setSettingsOpen((o) => !o)}
                className="flex items-center gap-1.5 text-[13px] text-[var(--text-muted)]"
              >
                Bet Settings
                <Settings size={15} strokeWidth={1.9} />
              </button>
            </div>

            {settingsOpen && (
              <label className="mx-4 mb-3 flex items-start gap-2 rounded bg-[var(--surface)] p-3">
                <input
                  type="checkbox"
                  checked={acceptOddsChanges}
                  onChange={(e) => setAcceptOddsChanges(e.target.checked)}
                  className="mt-0.5 accent-[var(--accent)]"
                />
                <span className="text-[12px] leading-relaxed text-[var(--text-muted)]">
                  Accept odds changes. With this off, a price that drifts before you submit will
                  stop the bet instead of placing it at the new number.
                </span>
              </label>
            )}

            {/* Mode tabs */}
            <div className="grid grid-cols-3 px-4">
              {TABS.map((t) => {
                const disabled = t.key !== "single" && legs.length < 2;
                const active = mode === t.key;
                return (
                  <button
                    key={t.key}
                    disabled={disabled}
                    onClick={() => setMode(t.key)}
                    className="py-3 text-[14px] font-medium disabled:opacity-30"
                    style={{
                      background: active ? "var(--bg-elevated)" : "var(--surface)",
                      color: active ? "var(--text-bright)" : "var(--text-muted)",
                      boxShadow: active ? "inset 0 2px 0 var(--accent)" : undefined,
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {mode === "system" && maths.sizes.length > 0 && (
              <div className="scroll-x flex gap-1.5 px-4 pt-3">
                {maths.sizes.map((k) => (
                  <button
                    key={k}
                    onClick={() => setSystemSize(k)}
                    className="shrink-0 rounded px-3 py-1.5 text-[12px] font-bold"
                    style={
                      maths.size === k
                        ? { background: "var(--accent)", color: "var(--accent-ink)" }
                        : { background: "var(--surface-2)", color: "var(--text-muted)" }
                    }
                  >
                    {k}/{legs.length}
                    <span className="ml-1 font-normal opacity-70">
                      ({combinationCount(legs.length, k)})
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Selections */}
            <ul
              className="min-h-0 divide-y divide-[var(--line)] overflow-y-auto"
              style={booked ? { maxHeight: "22vh" } : { flex: 1 }}
            >
              {legs.map((l) => (
                <li key={l.matchId} className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <BallIcon size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-bold text-[var(--text-bright)]">{l.outcomeLabel}</p>
                      <p className="mt-0.5 truncate text-[12px] text-[var(--text-muted)]">
                        {l.homeTeam} <span className="text-[var(--text-faint)]">vs</span> {l.awayTeam}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[12px] text-[var(--text-muted)]">
                        {l.marketLabel}
                        <CircleHelp size={12} strokeWidth={1.9} className="text-[var(--text-faint)]" />
                      </p>
                    </div>
                    <span className="text-[15px] font-bold">{l.odds.toFixed(2)}</span>
                    <button
                      onClick={() => remove(l.matchId)}
                      aria-label={`Remove ${l.homeTeam} v ${l.awayTeam}`}
                      className="pl-1 text-[var(--text-faint)]"
                    >
                      <Trash2 size={15} strokeWidth={1.9} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {booked ? (
              <BookedCode
                code={booked.code}
                expiresAt={booked.expiresAt}
                onDone={() => setBooked(null)}
              />
            ) : (
              <>
            {/* Bonus progress, on multiples only */}
            {mode === "multiple" && (
              <div className="mx-4 mt-3 overflow-hidden rounded">
                <div
                  className="flex items-center gap-2 px-3 py-2"
                  style={{ background: standing.rate > 0 ? "var(--accent-dim)" : "var(--surface-2)" }}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: standing.rate > 0 ? "var(--accent-ink)" : "var(--accent)" }}
                  />
                  <p
                    className="text-[12px] font-medium"
                    style={{ color: standing.rate > 0 ? "var(--accent-ink)" : "var(--text-muted)" }}
                  >
                    {standing.rate > 0
                      ? `${(standing.rate * 100).toFixed(0)}% bonus on ${standing.qualifying} selections`
                      : `Add ${standing.toNext} more selection${standing.toNext === 1 ? "" : "s"} at ${QUALIFYING_ODDS.toFixed(2)}+ to earn a bonus`}
                  </p>
                </div>
              </div>
            )}

            {/* Totals */}
            <dl className="mt-3 px-4 text-[14px]">
              <div className="flex items-center justify-between py-2">
                <dt className="text-[var(--text-muted)]">
                  {mode === "multiple" ? "Total Stake" : "Stake per line"}
                </dt>
                <dd className="flex items-center gap-2">
                  <span className="text-[12px] text-[var(--text-muted)]">{currency}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    value={stake || ""}
                    onChange={(e) => setStake(Number(e.target.value))}
                    aria-label="Stake"
                    className="w-24 rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-right font-bold outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  />
                </dd>
              </div>

              {maths.lines > 1 && (
                <Row
                  label={mode === "system" ? `Lines (${maths.size}/${legs.length})` : "Lines"}
                  value={`${maths.lines} × ${formatMoney(stake, currency)}`}
                />
              )}

              <Row label="Total Odds" value={maths.totalOdds.toFixed(2)} />
              {mode === "multiple" && <Row label="Max. Bonus" value={maths.bonus.toFixed(2)} />}

              <div className="-mx-4 mt-1 flex items-center justify-between bg-[var(--surface)] px-4 py-2.5">
                <dt className="font-bold">Potential Win</dt>
                <dd className="font-black text-[var(--accent-soft)]">{maths.win.toFixed(2)}</dd>
              </div>
            </dl>

            {error && (
              <div className="mx-4 mt-2 rounded bg-[var(--lose-bg)] px-3 py-2 text-[12px] text-[var(--lose)]">
                <p>{error}</p>

                {deadLegs.length > 0 && (
                  <>
                    <ul className="mt-1.5 space-y-0.5 font-bold">
                      {deadLegs.map((l) => (
                        <li key={l.matchId}>
                          {l.homeTeam} v {l.awayTeam}
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => {
                        for (const l of deadLegs) remove(l.matchId);
                        setUnavailable([]);
                        setError(null);
                      }}
                      className="mt-2 rounded bg-[var(--lose)] px-2.5 py-1.5 text-[11px] font-black text-white"
                    >
                      Remove {deadLegs.length === 1 ? "it" : "them"} and keep the rest
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="mt-3 grid grid-cols-3">
              <button
                onClick={book}
                disabled={busy}
                className="bg-[var(--accent-dim)] py-3.5 text-[15px] font-bold text-[var(--accent-ink)] disabled:opacity-50"
              >
                Book Bet
              </button>

              {player ? (
                <button
                  onClick={place}
                  disabled={busy || stake <= 0}
                  className="col-span-2 bg-[var(--accent)] py-2.5 text-[var(--accent-ink)] disabled:opacity-50"
                >
                  <span className="block text-[16px] font-bold">
                    {busy ? "Placing…" : "Place Bet"}
                  </span>
                  <span className="block text-[11px] opacity-80">
                    About to pay {maths.cost.toFixed(2)}
                  </span>
                </button>
              ) : (
                <Link
                  href="/login"
                  className="col-span-2 bg-[var(--accent)] py-3.5 text-center text-[16px] font-bold text-[var(--accent-ink)]"
                >
                  Log in to bet
                </Link>
              )}
            </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="font-bold">{value}</dd>
    </div>
  );
}
