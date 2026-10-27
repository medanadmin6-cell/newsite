import { createHmac, randomInt, randomUUID, timingSafeEqual } from "crypto";

/**
 * Instant Football.
 *
 * A round is a batch of made-up fixtures. Odds and the later result come from
 * the same Poisson model. The only edge is the margin on the price. Nothing
 * here forces a return-to-player, and the result draw does not see the stake.
 *
 * The offer is signed. Kick off checks that signature, then draws each score
 * with node:crypto. The Monte Carlo seed prices 1UP and 2UP at offer time
 * only. It is not the result.
 */

const BASE_GOALS = 1.35;
const HOME_ADVANTAGE = 1.12;
const MARGIN = 0.07;
const GOAL_CAP = 10;
const UP_SAMPLES = 400;
const OFFER_MS = 3 * 60_000;

const CORRECT_SCORES = [
  "0-0",
  "1-0",
  "0-1",
  "1-1",
  "2-0",
  "0-2",
  "2-1",
  "1-2",
  "2-2",
  "3-0",
  "0-3",
  "3-1",
  "1-3",
] as const;

const OUTCOMES: Record<string, readonly string[]> = {
  "1x2": ["1", "X", "2"],
  "1up": ["1", "X", "2"],
  "2up": ["1", "X", "2"],
  ou15: ["over", "under"],
  ou25: ["over", "under"],
  ou35: ["over", "under"],
  btts: ["yes", "no"],
  dc: ["1X", "12", "X2"],
  cs: CORRECT_SCORES,
};

const ALLOWED = new Set(
  Object.entries(OUTCOMES).flatMap(([market, outcomes]) => outcomes.map((outcome) => `${market}:${outcome}`)),
);

export const LEAGUE_IDS = ["england", "spain", "germany", "italy", "champions"] as const;
export type LeagueId = (typeof LEAGUE_IDS)[number];

export const LEAGUE_NAMES: Record<LeagueId, string> = {
  england: "England",
  spain: "Spain",
  germany: "Germany",
  italy: "Italy",
  champions: "Champions",
};

/**
 * Attack and defense live in this module. The signed offer carries a copy so
 * a swapped rating fails the signature. Stars are derived from the average.
 */
const RATINGS: Record<string, [number, number]> = {
  MCI: [94, 90],
  ARS: [93, 91],
  LIV: [92, 90],
  CHE: [86, 82],
  MUN: [85, 83],
  TOT: [88, 80],
  NEW: [84, 82],
  AVL: [74, 70],
  BHA: [73, 71],
  WHU: [76, 70],
  EVE: [72, 74],
  NFO: [75, 69],
  FUL: [71, 73],
  LEE: [74, 72],
  BRE: [62, 58],
  CRY: [60, 61],
  WOL: [64, 57],
  BOU: [63, 59],
  SUN: [61, 60],
  IPS: [54, 52],

  RMA: [94, 90],
  BAR: [92, 90],
  ATM: [86, 88],
  SEV: [84, 82],
  VIL: [85, 81],
  BET: [74, 72],
  RSO: [73, 71],
  VAL: [76, 70],
  ATH: [78, 74],
  CEL: [72, 70],
  GET: [71, 73],
  OSA: [70, 74],
  GIR: [75, 71],
  RAY: [62, 60],
  MAL: [61, 59],
  ALA: [63, 58],
  LEG: [60, 62],
  ESP: [64, 58],
  VLD: [58, 56],
  RCC: [53, 52],

  BAY: [95, 92],
  BVB: [90, 88],
  RBL: [88, 84],
  B04: [86, 83],
  SGE: [84, 80],
  WOB: [76, 72],
  VFB: [78, 74],
  SCF: [74, 72],
  TSG: [77, 71],
  M05: [73, 71],
  FCA: [72, 70],
  BOC: [62, 60],
  SVW: [61, 59],
  BSC: [64, 58],
  KOE: [60, 62],
  FCU: [63, 57],
  KIE: [70, 68],
  F95: [59, 57],
  S04: [58, 60],
  MGL: [54, 53],

  JUV: [86, 84],
  INT: [93, 91],
  MIL: [90, 88],
  NAP: [88, 82],
  ROM: [84, 80],
  LAZ: [82, 80],
  ATA: [85, 83],
  FIO: [76, 72],
  BOL: [74, 73],
  TOR: [73, 71],
  UDI: [72, 70],
  GEN: [71, 69],
  CAG: [62, 60],
  VER: [61, 59],
  LEC: [64, 58],
  EMP: [60, 62],
  COM: [75, 71],
  PAR: [70, 72],
  PIS: [58, 56],
  SAS: [63, 59],
};

const LEAGUE_TEAMS: Record<LeagueId, string[]> = {
  england: [
    "LEE", "TOT", "MCI", "LIV", "ARS", "CHE", "MUN", "NEW", "AVL", "BHA",
    "WHU", "EVE", "NFO", "FUL", "BRE", "CRY", "WOL", "BOU", "IPS", "SUN",
  ],
  spain: [
    "RMA", "BAR", "ATM", "SEV", "VIL", "BET", "RSO", "VAL", "ATH", "CEL",
    "GET", "OSA", "GIR", "RAY", "MAL", "ALA", "LEG", "ESP", "VLD", "RCC",
  ],
  germany: [
    "BAY", "BVB", "RBL", "B04", "SGE", "WOB", "VFB", "SCF", "TSG", "M05",
    "FCA", "BOC", "SVW", "BSC", "KOE", "FCU", "KIE", "F95", "S04", "MGL",
  ],
  italy: [
    "JUV", "INT", "MIL", "NAP", "ROM", "LAZ", "ATA", "FIO", "BOL", "TOR",
    "UDI", "GEN", "CAG", "VER", "LEC", "EMP", "COM", "PAR", "PIS", "SAS",
  ],
  champions: [
    "MCI", "ARS", "LIV", "CHE", "MUN", "TOT", "RMA", "BAR", "ATM", "SEV",
    "BAY", "BVB", "RBL", "B04", "JUV", "INT", "MIL", "NAP", "ROM", "NEW",
  ],
};

const PALETTE = [
  "#1d4ed8",
  "#b91c1c",
  "#047857",
  "#b45309",
  "#6d28d9",
  "#0f766e",
  "#be185d",
  "#1e3a8a",
  "#a16207",
  "#0369a1",
  "#4d7c0f",
  "#9f1239",
];

export interface VirtualSide {
  code: string;
  attack: number;
  defense: number;
  stars: number;
  color: string;
}

export interface VirtualPrice {
  market: string;
  outcome: string;
  /** Fair probability before the margin. Settlement does not read this. */
  p: number;
  odds: number;
}

export interface VirtualFixture {
  id: string;
  /** Seeds the 1UP/2UP price only. The result is drawn later, without it. */
  seed: number;
  home: VirtualSide;
  away: VirtualSide;
  lambdaHome: number;
  lambdaAway: number;
  prices: VirtualPrice[];
}

export interface VirtualLeague {
  league: LeagueId;
  fixtures: VirtualFixture[];
}

/** Every league is offered together, so one slip can pick across them. */
export interface VirtualBoard {
  id: string;
  exp: number;
  leagues: VirtualLeague[];
}

export interface DrawnMatch {
  homeGoals: number;
  awayGoals: number;
  maxHomeLead: number;
  maxAwayLead: number;
  events: { minute: number; home: number; away: number }[];
}

function signingKey(): string {
  const key = process.env.ADMIN_PASSWORD || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!key) throw new Error("Virtuals need a server secret");
  return key;
}

function sign(body: string): string {
  return createHmac("sha256", signingKey()).update(body).digest("hex");
}

function colorFor(code: string): string {
  let hash = 0;
  for (let i = 0; i < code.length; i++) hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

/** 50 overall is 1 star, 95 overall is 5. */
export function strengthStars(attack: number, defense: number): number {
  const overall = (attack + defense) / 2;
  const stars = Math.round(1 + ((overall - 50) / 45) * 4);
  return Math.min(5, Math.max(1, stars));
}

function clampLambda(value: number): number {
  const clamped = Math.min(3.2, Math.max(0.4, value));
  return Math.round(clamped * 10000) / 10000;
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function displayOdds(probability: number): number {
  const p = Math.min(0.999, Math.max(probability, 1e-6));
  const priced = 1 / p / (1 + MARGIN);
  return Math.max(1.01, Math.round(priced * 100) / 100);
}

function quote(probability: number): { p: number; odds: number } {
  const p = round6(Math.min(1, Math.max(0, probability)));
  return { p, odds: displayOdds(p) };
}

function poissonRow(lambda: number): number[] {
  const probs = new Array<number>(GOAL_CAP + 1);
  probs[0] = Math.exp(-lambda);
  for (let k = 1; k <= GOAL_CAP; k++) probs[k] = (probs[k - 1] * lambda) / k;
  const sum = probs.reduce((total, value) => total + value, 0);
  for (let k = 0; k <= GOAL_CAP; k++) probs[k] /= sum;
  return probs;
}

function scoreMatrix(lambdaHome: number, lambdaAway: number): number[][] {
  const home = poissonRow(lambdaHome);
  const away = poissonRow(lambdaAway);
  return home.map((homeP) => away.map((awayP) => homeP * awayP));
}

function sumWhere(matrix: number[][], pred: (home: number, away: number) => boolean): number {
  let total = 0;
  for (let home = 0; home <= GOAL_CAP; home++) {
    for (let away = 0; away <= GOAL_CAP; away++) {
      if (pred(home, away)) total += matrix[home][away];
    }
  }
  return total;
}

/** Deterministic generator for offer-time 1UP/2UP prices. Not used at kick off. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function samplePoissonRng(lambda: number, rng: () => number): number {
  const u = Math.min(0.999999, Math.max(1e-9, rng()));
  let p = Math.exp(-lambda);
  let cdf = p;
  let k = 0;
  while (u > cdf && k < 20) {
    k += 1;
    p *= lambda / k;
    cdf += p;
  }
  return k;
}

/**
 * 1UP / 2UP follow a timeline. Each goal is given a minute from 1 to 90 and
 * the running score is walked one goal at a time. 1UP home wins if home's
 * lead ever reaches 1. 2UP home wins if that lead ever reaches 2. Away is the
 * same with the lead reversed. The draw in both markets is a full-time draw.
 * A one-goal lead can disappear later, so 1UP can win on a draw or a loss.
 */
function maxLeads(homeGoals: number, awayGoals: number, rng: () => number): { home: number; away: number } {
  const events: { minute: number; side: "home" | "away"; tie: number }[] = [];
  for (let i = 0; i < homeGoals; i++) {
    events.push({ minute: 1 + Math.floor(rng() * 90), side: "home", tie: rng() });
  }
  for (let i = 0; i < awayGoals; i++) {
    events.push({ minute: 1 + Math.floor(rng() * 90), side: "away", tie: rng() });
  }
  events.sort((a, b) => a.minute - b.minute || a.tie - b.tie);
  let home = 0;
  let away = 0;
  let maxHome = 0;
  let maxAway = 0;
  for (const event of events) {
    if (event.side === "home") home += 1;
    else away += 1;
    maxHome = Math.max(maxHome, home - away);
    maxAway = Math.max(maxAway, away - home);
  }
  return { home: maxHome, away: maxAway };
}

function monteCarloLeads(lambdaHome: number, lambdaAway: number, seed: number) {
  const rng = mulberry32(seed);
  let home1 = 0;
  let away1 = 0;
  let home2 = 0;
  let away2 = 0;
  for (let i = 0; i < UP_SAMPLES; i++) {
    const homeGoals = samplePoissonRng(lambdaHome, rng);
    const awayGoals = samplePoissonRng(lambdaAway, rng);
    const leads = maxLeads(homeGoals, awayGoals, rng);
    if (leads.home >= 1) home1 += 1;
    if (leads.away >= 1) away1 += 1;
    if (leads.home >= 2) home2 += 1;
    if (leads.away >= 2) away2 += 1;
  }
  // A zero count would price infinity. Half a sample keeps the price finite.
  const rate = (count: number) => (count === 0 ? 0.5 : count) / UP_SAMPLES;
  return {
    home1: rate(home1),
    away1: rate(away1),
    home2: rate(home2),
    away2: rate(away2),
  };
}

function priceFixture(lambdaHome: number, lambdaAway: number, seed: number): VirtualPrice[] {
  const matrix = scoreMatrix(lambdaHome, lambdaAway);
  const home = sumWhere(matrix, (h, a) => h > a);
  const draw = sumWhere(matrix, (h, a) => h === a);
  const away = sumWhere(matrix, (h, a) => h < a);
  const leads = monteCarloLeads(lambdaHome, lambdaAway, seed);
  const rows: VirtualPrice[] = [];
  const push = (market: string, outcome: string, probability: number) => {
    const quoted = quote(probability);
    rows.push({ market, outcome, p: quoted.p, odds: quoted.odds });
  };

  push("1x2", "1", home);
  push("1x2", "X", draw);
  push("1x2", "2", away);
  // 1 and 2 are Monte Carlo. The draw is the matrix draw: it is full time.
  push("1up", "1", leads.home1);
  push("1up", "X", draw);
  push("1up", "2", leads.away1);
  push("2up", "1", leads.home2);
  push("2up", "X", draw);
  push("2up", "2", leads.away2);

  for (const [market, line] of [
    ["ou15", 1.5],
    ["ou25", 2.5],
    ["ou35", 3.5],
  ] as const) {
    push(market, "over", sumWhere(matrix, (h, a) => h + a > line));
    push(market, "under", sumWhere(matrix, (h, a) => h + a < line));
  }

  const btts = sumWhere(matrix, (h, a) => h > 0 && a > 0);
  push("btts", "yes", btts);
  push("btts", "no", 1 - btts);
  push("dc", "1X", home + draw);
  push("dc", "12", home + away);
  push("dc", "X2", draw + away);

  for (const score of CORRECT_SCORES) {
    const [h, a] = score.split("-").map(Number);
    push("cs", score, matrix[h][a]);
  }
  return rows;
}

function sideFrom(code: string): VirtualSide {
  const rating = RATINGS[code];
  const attack = rating[0];
  const defense = rating[1];
  return {
    code,
    attack,
    defense,
    stars: strengthStars(attack, defense),
    color: colorFor(code),
  };
}

function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    const current = copy[i];
    copy[i] = copy[j];
    copy[j] = current;
  }
  return copy;
}

function canonicalFixture(fixture: VirtualFixture) {
  return {
    id: fixture.id,
    seed: fixture.seed,
    home: {
      code: fixture.home.code,
      attack: fixture.home.attack,
      defense: fixture.home.defense,
      stars: fixture.home.stars,
    },
    away: {
      code: fixture.away.code,
      attack: fixture.away.attack,
      defense: fixture.away.defense,
      stars: fixture.away.stars,
    },
    lambdaHome: fixture.lambdaHome,
    lambdaAway: fixture.lambdaAway,
    prices: [...fixture.prices]
      .map((price) => ({
        market: price.market,
        outcome: price.outcome,
        p: price.p,
        odds: price.odds,
      }))
      .sort((a, b) => (a.market + a.outcome).localeCompare(b.market + b.outcome)),
  };
}

/** Stable text for the signature, so key order cannot change a price. */
export function canonicalBoard(board: VirtualBoard): string {
  return JSON.stringify({
    id: board.id,
    exp: board.exp,
    leagues: [...board.leagues]
      .map((group) => ({
        league: group.league,
        fixtures: group.fixtures.map(canonicalFixture),
      }))
      .sort((a, b) => a.league.localeCompare(b.league)),
  });
}

function isLeague(value: string): value is LeagueId {
  return (LEAGUE_IDS as readonly string[]).includes(value);
}

function buildLeague(league: LeagueId): VirtualLeague {
  const count = randomInt(8, 11);
  const picked = shuffle(LEAGUE_TEAMS[league]).slice(0, count * 2);
  const fixtures: VirtualFixture[] = [];
  for (let i = 0; i < count; i++) {
    const home = sideFrom(picked[i * 2]);
    const away = sideFrom(picked[i * 2 + 1]);
    const lambdaHome = clampLambda(BASE_GOALS * (home.attack / away.defense) * HOME_ADVANTAGE);
    const lambdaAway = clampLambda(BASE_GOALS * (away.attack / home.defense));
    const seed = randomInt(1, 2147483647);
    fixtures.push({
      id: randomUUID(),
      seed,
      home,
      away,
      lambdaHome,
      lambdaAway,
      prices: priceFixture(lambdaHome, lambdaAway, seed),
    });
  }
  return { league, fixtures };
}

/** One signed board: England, Spain, Germany, Italy and Champions together. */
export function freshBoard(): { board: VirtualBoard; token: string } {
  const board: VirtualBoard = {
    id: randomUUID(),
    exp: Date.now() + OFFER_MS,
    leagues: LEAGUE_IDS.map(buildLeague),
  };
  return { board, token: sign(canonicalBoard(board)) };
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseSide(value: unknown): VirtualSide | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const code = row.code;
  const attack = num(row.attack);
  const defense = num(row.defense);
  const stars = num(row.stars);
  if (typeof code !== "string" || !/^[A-Z0-9]{2,4}$/.test(code)) return null;
  if (attack === null || attack < 50 || attack > 95) return null;
  if (defense === null || defense < 50 || defense > 95) return null;
  if (stars === null || stars < 1 || stars > 5 || stars !== Math.round(stars)) return null;
  const color = typeof row.color === "string" && /^#[0-9a-fA-F]{6}$/.test(row.color) ? row.color : "#334155";
  return { code, attack, defense, stars, color };
}

function parsePrices(value: unknown): VirtualPrice[] | null {
  if (!Array.isArray(value)) return null;
  const got = new Map<string, VirtualPrice>();
  for (const row of value) {
    if (!row || typeof row !== "object") return null;
    const price = row as Record<string, unknown>;
    const market = price.market;
    const outcome = price.outcome;
    const p = num(price.p);
    const odds = num(price.odds);
    if (typeof market !== "string" || typeof outcome !== "string") return null;
    const key = `${market}:${outcome}`;
    if (!ALLOWED.has(key) || got.has(key)) return null;
    if (p === null || p < 0 || p > 1) return null;
    if (odds === null) return null;
    const roundedOdds = Math.round(odds * 100) / 100;
    const roundedP = round6(p);
    if (roundedOdds < 1.01 || roundedOdds > 10000) return null;
    got.set(key, { market, outcome, p: roundedP, odds: roundedOdds });
  }
  if (got.size !== ALLOWED.size) return null;
  return [...got.values()];
}

function parseFixtures(value: unknown): VirtualFixture[] | null {
  if (!Array.isArray(value) || value.length < 8 || value.length > 10) return null;
  const fixtures: VirtualFixture[] = [];
  const seenTeams = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const fixture = item as Record<string, unknown>;
    const fixtureId = fixture.id;
    const seed = num(fixture.seed);
    const lambdaHome = num(fixture.lambdaHome);
    const lambdaAway = num(fixture.lambdaAway);
    if (typeof fixtureId !== "string" || fixtureId.length < 8) return null;
    if (seed === null || seed < 1 || seed > 2147483646 || seed !== Math.round(seed)) return null;
    if (lambdaHome === null || lambdaAway === null) return null;
    const homeLambda = Math.round(lambdaHome * 10000) / 10000;
    const awayLambda = Math.round(lambdaAway * 10000) / 10000;
    if (homeLambda < 0.4 || homeLambda > 3.2 || awayLambda < 0.4 || awayLambda > 3.2) return null;
    const home = parseSide(fixture.home);
    const away = parseSide(fixture.away);
    const prices = parsePrices(fixture.prices);
    if (!home || !away || !prices) return null;
    if (home.code === away.code) return null;
    if (seenTeams.has(home.code) || seenTeams.has(away.code)) return null;
    seenTeams.add(home.code);
    seenTeams.add(away.code);
    fixtures.push({
      id: fixtureId,
      seed,
      home,
      away,
      lambdaHome: homeLambda,
      lambdaAway: awayLambda,
      prices,
    });
  }
  return fixtures;
}

function parseBoard(value: unknown): VirtualBoard | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = row.id;
  const exp = num(row.exp);
  if (typeof id !== "string" || id.length < 8 || id.length > 80) return null;
  if (exp === null) return null;
  if (!Array.isArray(row.leagues) || row.leagues.length !== LEAGUE_IDS.length) return null;

  const leagues: VirtualLeague[] = [];
  const seenLeagues = new Set<string>();
  for (const item of row.leagues) {
    if (!item || typeof item !== "object") return null;
    const group = item as Record<string, unknown>;
    const league = group.league;
    if (typeof league !== "string" || !isLeague(league) || seenLeagues.has(league)) return null;
    const fixtures = parseFixtures(group.fixtures);
    if (!fixtures) return null;
    seenLeagues.add(league);
    leagues.push({ league, fixtures });
  }
  if (seenLeagues.size !== LEAGUE_IDS.length) return null;
  return { id, exp, leagues };
}

export function readBoard(
  input: unknown,
  token: string,
): { ok: true; board: VirtualBoard } | { ok: false; reason: "invalid" | "expired" } {
  const board = parseBoard(input);
  if (!board || typeof token !== "string") return { ok: false, reason: "invalid" };
  const expected = sign(canonicalBoard(board));
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "invalid" };
  if (board.exp < Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, board };
}

export function findFixture(board: VirtualBoard, fixtureId: string) {
  for (const group of board.leagues) {
    const fixture = group.fixtures.find((row) => row.id === fixtureId);
    if (fixture) return { fixture, league: group.league };
  }
  return null;
}

/**
 * Poisson sample for a signed lambda.
 * The stake, the pick, and the offer seed are intentionally not arguments.
 */
export function samplePoisson(lambda: number): number {
  const u = (randomInt(0, 1_000_000_000) + 0.5) / 1_000_000_000;
  let p = Math.exp(-lambda);
  let cdf = p;
  let k = 0;
  while (u > cdf && k < 20) {
    k += 1;
    p *= lambda / k;
    cdf += p;
  }
  return k;
}

/** Draw a score and the timeline used to judge 1UP and 2UP. */
export function drawFixture(lambdaHome: number, lambdaAway: number): DrawnMatch {
  const homeGoals = samplePoisson(lambdaHome);
  const awayGoals = samplePoisson(lambdaAway);
  const events: { minute: number; side: "home" | "away"; tie: number }[] = [];
  for (let i = 0; i < homeGoals; i++) {
    events.push({ minute: randomInt(1, 91), side: "home", tie: randomInt(0, 1_000_000) });
  }
  for (let i = 0; i < awayGoals; i++) {
    events.push({ minute: randomInt(1, 91), side: "away", tie: randomInt(0, 1_000_000) });
  }
  events.sort((a, b) => a.minute - b.minute || a.tie - b.tie);

  let home = 0;
  let away = 0;
  let maxHomeLead = 0;
  let maxAwayLead = 0;
  const played: DrawnMatch["events"] = [];
  for (const event of events) {
    if (event.side === "home") home += 1;
    else away += 1;
    maxHomeLead = Math.max(maxHomeLead, home - away);
    maxAwayLead = Math.max(maxAwayLead, away - home);
    played.push({ minute: event.minute, home, away });
  }
  return { homeGoals, awayGoals, maxHomeLead, maxAwayLead, events: played };
}

export function outcomeWins(market: string, outcome: string, drawn: DrawnMatch): boolean {
  const home = drawn.homeGoals;
  const away = drawn.awayGoals;
  const total = home + away;
  if (market === "1x2") {
    if (outcome === "1") return home > away;
    if (outcome === "X") return home === away;
    if (outcome === "2") return home < away;
  }
  if (market === "1up") {
    if (outcome === "1") return drawn.maxHomeLead >= 1;
    if (outcome === "2") return drawn.maxAwayLead >= 1;
    if (outcome === "X") return home === away;
  }
  if (market === "2up") {
    if (outcome === "1") return drawn.maxHomeLead >= 2;
    if (outcome === "2") return drawn.maxAwayLead >= 2;
    if (outcome === "X") return home === away;
  }
  if (market === "ou15") return outcome === "over" ? total >= 2 : total <= 1;
  if (market === "ou25") return outcome === "over" ? total >= 3 : total <= 2;
  if (market === "ou35") return outcome === "over" ? total >= 4 : total <= 3;
  if (market === "btts") {
    const yes = home > 0 && away > 0;
    return outcome === "yes" ? yes : !yes;
  }
  if (market === "dc") {
    if (outcome === "1X") return home >= away;
    if (outcome === "12") return home !== away;
    if (outcome === "X2") return home <= away;
  }
  if (market === "cs") return outcome === `${home}-${away}`;
  return false;
}

export function signedOdds(fixture: VirtualFixture, market: string, outcome: string): number | null {
  const price = fixture.prices.find((row) => row.market === market && row.outcome === outcome);
  return price ? price.odds : null;
}
