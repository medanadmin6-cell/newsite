"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Client state: the bet slip, the signed-in player, and the popularity counts
 * shown against each market.
 *
 * The player id living here is exactly the weakness called out in the README —
 * there is no server session, so this id is the whole credential.
 */

export interface SlipLeg {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoff: string;
  market: string;
  marketLabel: string;
  outcome: string;
  outcomeLabel: string;
  odds: number;
}

export type SlipMode = "single" | "multiple" | "system";

interface SlipState {
  legs: SlipLeg[];
  stake: number;
  open: boolean;
  mode: SlipMode;
  /** Combination size for a system ticket. */
  systemSize: number;
  /** Whether a price that drifts before submit is accepted silently. */
  acceptOddsChanges: boolean;
  add: (leg: SlipLeg) => void;
  remove: (matchId: string) => void;
  toggle: (leg: SlipLeg) => void;
  clear: () => void;
  /** Empty the slip but keep the sheet open, so a receipt can be shown. */
  clearLegs: () => void;
  setStake: (stake: number) => void;
  setOpen: (open: boolean) => void;
  setMode: (mode: SlipMode) => void;
  setSystemSize: (size: number) => void;
  setAcceptOddsChanges: (accept: boolean) => void;
  load: (legs: SlipLeg[]) => void;
  has: (matchId: string, market: string, outcome: string) => boolean;
  totalOdds: () => number;
  potentialWin: () => number;
}

const MAX_LEGS = 30;

export const useSlip = create<SlipState>()(
  persist(
    (set, get) => ({
      legs: [],
      stake: 10,
      open: false,
      mode: "multiple",
      systemSize: 2,
      acceptOddsChanges: true,

      add: (leg) =>
        set((s) => {
          // One leg per match: a new pick on the same fixture replaces the old.
          const rest = s.legs.filter((l) => l.matchId !== leg.matchId);
          if (rest.length >= MAX_LEGS) return s;
          return { legs: [...rest, leg] };
        }),

      remove: (matchId) => set((s) => ({ legs: s.legs.filter((l) => l.matchId !== matchId) })),

      toggle: (leg) =>
        set((s) => {
          const existing = s.legs.find((l) => l.matchId === leg.matchId);
          if (existing && existing.market === leg.market && existing.outcome === leg.outcome) {
            return { legs: s.legs.filter((l) => l.matchId !== leg.matchId) };
          }
          const rest = s.legs.filter((l) => l.matchId !== leg.matchId);
          if (rest.length >= MAX_LEGS) return s;
          return { legs: [...rest, leg] };
        }),

      clear: () => set({ legs: [], open: false }),
      clearLegs: () => set({ legs: [] }),
      setStake: (stake) => set({ stake: Math.max(0, stake) }),
      setOpen: (open) => set({ open }),
      setMode: (mode) => set({ mode }),
      setSystemSize: (systemSize) => set({ systemSize: Math.max(2, systemSize) }),
      setAcceptOddsChanges: (acceptOddsChanges) => set({ acceptOddsChanges }),
      load: (legs) => set({ legs: legs.slice(0, MAX_LEGS), open: true }),

      has: (matchId, market, outcome) =>
        get().legs.some((l) => l.matchId === matchId && l.market === market && l.outcome === outcome),

      totalOdds: () => {
        const product = get().legs.reduce((acc, l) => acc * l.odds, 1);
        return Math.round(Math.min(10_000, product) * 1000) / 1000;
      },

      potentialWin: () => {
        const { stake } = get();
        return Math.round(stake * get().totalOdds() * 100) / 100;
      },
    }),
    {
      name: "betlixx-slip",
      partialize: (s) => ({
        legs: s.legs,
        stake: s.stake,
        mode: s.mode,
        systemSize: s.systemSize,
        acceptOddsChanges: s.acceptOddsChanges,
      }),
    },
  ),
);

// ------------------------------------------------------------------ session

export interface Player {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  country_code: string;
  currency: string;
  balance: number;
}

interface SessionState {
  player: Player | null;
  hydrated: boolean;
  /**
   * Open tickets, for the count on the My Bets tab. Deliberately outside
   * `partialize`: a stale number restored from storage would show a badge for
   * tickets that settled while the app was closed.
   */
  openBets: number;
  signIn: (player: Player) => void;
  signOut: () => void;
  setBalance: (balance: number) => void;
  setOpenBets: (count: number) => void;
  /** Placing a slip bumps the badge now, rather than waiting on the next poll. */
  addOpenBets: (delta: number) => void;
  markHydrated: () => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      player: null,
      hydrated: false,
      openBets: 0,
      signIn: (player) => set({ player }),
      signOut: () => set({ player: null, openBets: 0 }),
      setBalance: (balance) =>
        set((s) => {
          if (!s.player || s.player.balance === balance) return s;
          return { player: { ...s.player, balance } };
        }),
      setOpenBets: (openBets) => set({ openBets }),
      addOpenBets: (delta) => set((s) => ({ openBets: Math.max(0, s.openBets + delta) })),
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "betlixx-session",
      partialize: (s) => ({ player: s.player }),
      onRehydrateStorage: () => (state) => state?.markHydrated(),
    },
  ),
);

// --------------------------------------------------------------- popularity

interface PopularityState {
  counts: Record<string, number>;
  seed: (matchIds: string[]) => void;
}

/**
 * How many players are said to be on each pick. Generated once per page view
 * and deterministic per match, so the number does not jump between polls.
 * This is a marketing prop, not a real count.
 */
export const usePopularity = create<PopularityState>((set, get) => ({
  counts: {},
  seed: (matchIds) => {
    const existing = get().counts;
    const next = { ...existing };
    let changed = false;
    for (const id of matchIds) {
      if (next[id] != null) continue;
      let h = 0;
      for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
      next[id] = 40 + (h % 4200);
      changed = true;
    }
    if (changed) set({ counts: next });
  },
}));
