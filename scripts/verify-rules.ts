/**
 * Checks the pure business rules — clock, odds, and the withdrawal gate —
 * without needing a database. Run with: npm run verify
 */
import { matchClock, scoreFromTimeline } from "../lib/clock";
import { deriveMarkets, driftOdds } from "../lib/odds";
import { checkWithdrawalGate } from "../lib/withdrawals";
import { buildMarkets } from "../lib/markets";
import { resolveSelection } from "../lib/resolve";
import { isMinorCompetition } from "../lib/api-football";
import { classifyEvent } from "../lib/tracker";
import { normalisePhone, maskPhoneTail } from "../lib/countries";
import { cashoutOffer, CASHOUT_MARGIN, type CashoutLeg } from "../lib/cashout";
import { correctScoreMarket, goalCountMarkets, ratesFromOdds } from "../lib/scoreline";
import { standing, maskPhone, TIERS } from "../lib/tiers";
import {
  bonusFor,
  bonusAmount,
  potentialWin,
  combinations,
  combinationCount,
  systemSizes,
} from "../lib/bonus";

const LOYALTY_HEADING = "\nLoyalty tiers";
const SLIP_HEADING = "\nAccumulator bonus and system lines";
const RESOLVE_HEADING = "\nSelection resolution across both vocabularies";
const CASHOUT_HEADING = "\nCashout valuation";

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

const minsAgo = (n: number) => new Date(Date.now() - n * 60_000);

console.log("\nMatch clock");
{
  const pre = matchClock(new Date(Date.now() + 3_600_000));
  check("upcoming match is not live", pre.phase === "pre" && !pre.isLive && !pre.isOver);

  const first = matchClock(minsAgo(20));
  check("20 minutes in is the first half", first.phase === "first" && first.minute === 20);

  const ht = matchClock(minsAgo(50));
  check("50 minutes in is half time", ht.phase === "ht" && ht.label === "HT");

  const second = matchClock(minsAgo(70));
  check("70 minutes in is the second half at 55", second.phase === "second" && second.minute === 55);

  const ft = matchClock(minsAgo(120));
  check("past full time is over", ft.isOver && ft.label === "FT" && !ft.isLive);
}

console.log("\nScripted goal timeline");
{
  const timeline = [
    { minute: 12, team: "home" as const },
    { minute: 58, team: "away" as const },
    { minute: 80, team: "home" as const },
  ];

  const at30 = scoreFromTimeline(timeline, matchClock(minsAgo(30)));
  check("only goals up to the current minute count", at30.home === 1 && at30.away === 0,
    JSON.stringify(at30));

  const atFt = scoreFromTimeline(timeline, matchClock(minsAgo(120)));
  check("a finished match counts every goal", atFt.home === 2 && atFt.away === 1,
    JSON.stringify(atFt));
}

console.log("\nDerived markets");
{
  const markets = deriveMarkets(2.0, 3.4, 3.8);
  check("every market is priced", markets.length === 6);
  check("1X2 passes through unchanged",
    markets[0].prices.map((p) => p.odds).join(",") === "2,3.4,3.8");

  const dc = markets.find((m) => m.key === "dc")!;
  const oneX = dc.prices.find((p) => p.outcome === "1X")!.odds;
  check("double chance is shorter than the single it covers", oneX < 2.0, `1X=${oneX}`);
  check("every derived price is a real price",
    markets.every((m) => m.prices.every((p) => p.odds > 1 && Number.isFinite(p.odds))));
}

console.log("\nLive odds drift");
{
  const base = { home: 2.0, draw: 3.4, away: 3.8 };

  const early = driftOdds(base, { home: 1, away: 0 }, 10);
  const late = driftOdds(base, { home: 1, away: 0 }, 85);
  check("the leader shortens", early.home < base.home, `${early.home}`);
  check("the swing grows as the match runs on", late.home < early.home, `${late.home} < ${early.home}`);
  check("the trailer drifts out", late.away > base.away, `${late.away}`);

  const levelLate = driftOdds(base, { home: 0, away: 0 }, 85);
  check("a level game late shortens the draw", levelLate.draw < base.draw, `${levelLate.draw}`);
}

console.log("\nWithdrawal gate (Ghana: 6 deposits of GHS 200, then GHS 300)");
{
  const player = {
    country_code: "GH",
    currency: "GHS",
    balance: 500,
    total_deposited: 900,
    qualifying_deposits: 0,
    verification_topup: false,
    withdrawal_approved: false,
    payout_number: "0244123456",
    payout_bank: null,
  };

  const noDetails = checkWithdrawalGate({ ...player, payout_number: "12" }, 100);
  check("gate 1 rejects a bad payout number", noDetails.failed === "details");

  // 900 deposited in one go is still zero qualifying deposits.
  const notEnough = checkWithdrawalGate(player, 100);
  check("gate 2 counts deposits rather than summing them", notEnough.failed === "deposits",
    JSON.stringify(notEnough.failed));

  const counted = { ...player, qualifying_deposits: 6 };
  const needsTopUp = checkWithdrawalGate(counted, 100);
  check("the counted deposits still leave the extra 300", needsTopUp.failed === "deposits" && needsTopUp.progress.amount === 300,
    JSON.stringify(needsTopUp.progress));

  const qualified = { ...counted, verification_topup: true };
  const needsApproval = checkWithdrawalGate(qualified, 100);
  check("gate 3 asks for operator approval", needsApproval.failed === "approval");

  const approved = { ...qualified, withdrawal_approved: true };
  check("a fully qualified player passes", checkWithdrawalGate(approved, 100).ok);

  const overBalance = checkWithdrawalGate(approved, 5000);
  check("cannot withdraw more than the balance", !overBalance.ok);

  check("progress is reported for the meter",
    needsTopUp.progress.have === 6 && needsTopUp.progress.need === 7);

  const exempt = checkWithdrawalGate(player, 100, {}, { skipDepositGate: true });
  check("an admin or approved sub-admin skips the deposit gate", exempt.failed === "approval");
}

console.log("\nMarket grouping and 1X2 outcome labels");
{
  const markets = buildMarkets([
    {
      id: 1,
      name: "Test Book",
      bets: [
        {
          id: 1,
          name: "Match Winner",
          values: [
            { value: "Home", odd: "2.10" },
            { value: "Draw", odd: "3.30" },
            { value: "Away", odd: "3.40" },
          ],
        },
        {
          id: 45,
          name: "Corners Over Under",
          values: [
            { value: "Over 9.5", odd: "1.85" },
            { value: "Under 9.5", odd: "1.95" },
          ],
        },
        {
          id: 6,
          name: "Goals Over/Under First Half",
          values: [
            { value: "Over 1.5", odd: "3.80" },
            { value: "Under 1.5", odd: "1.22" },
          ],
        },
        {
          id: 4,
          name: "Asian Handicap",
          values: [
            { value: "Home -0.5", odd: "2.05" },
            { value: "Away +0.5", odd: "1.80" },
          ],
        },
        {
          id: 27,
          name: "Clean Sheet - Home",
          values: [
            { value: "Yes", odd: "2.40" },
            { value: "No", odd: "1.55" },
          ],
        },
        // Kept, and flagged dense so the card lays it out as a grid.
        {
          id: 10,
          name: "Exact Score",
          values: [
            { value: "1:0", odd: "6.00" },
            { value: "2:0", odd: "12.00" },
          ],
        },
      ],
    },
  ]);

  const byLabel = Object.fromEntries(markets.map((m) => [m.label, m.group]));

  check("1X2 is ordered first", markets[0]?.key === "af1", markets[0]?.key);
  check("Match Winner is relabelled 1X2", markets[0]?.label === "1X2", markets[0]?.label);
  check("corners group as corners", byLabel["Corners Over / Under"] === "corners");
  check("a first-half goals market groups as half", byLabel["Goals Over / Under First Half"] === "half");
  check("asian handicap groups as handicap", byLabel["Asian Handicap"] === "handicap");
  check("clean sheet groups as teams", byLabel["Clean Sheet - Home"] === "teams");
  const exact = markets.find((m) => m.label === "Exact Score");
  check("exact score is offered", Boolean(exact));
  check("exact score renders dense", exact?.dense === true);
  check("exact score is grouped as a special", exact?.group === "specials");
  check("every market keeps at least two prices", markets.every((m) => m.prices.length >= 2));
}

console.log("\nDerived scoreline markets (operator fixtures)");
{
  const [h, d, a] = [2.5, 3.3, 2.8];
  const cs = correctScoreMarket(h, d, a);
  const rates = ratesFromOdds(h, d, a);

  check("a correct-score market is produced", cs.key === "cs" && cs.prices.length > 10);
  check("it renders dense", cs.dense === true);
  check("goal rates are plausible", rates.home > 0.5 && rates.home < 3 && rates.away > 0.5 && rates.away < 3,
    JSON.stringify(rates));
  check("the catch-all outcome exists", cs.prices.some((p) => p.outcome === "Any Other"));
  check("every scoreline is a real price", cs.prices.every((p) => p.odds > 1 && Number.isFinite(p.odds)));

  // The scoreline grid must reproduce the 1X2 it was fitted to, otherwise a
  // player could back the same outcome twice at two different prices.
  let ph = 0;
  let pd = 0;
  let pa = 0;
  for (const p of cs.prices) {
    if (p.outcome === "Any Other") continue;
    const [i2, j2] = p.outcome.split(":").map(Number);
    const impl = 1 / p.odds;
    if (i2 > j2) ph += impl;
    else if (i2 === j2) pd += impl;
    else pa += impl;
  }
  const tot = ph + pd + pa;
  const raw = 1 / h + 1 / d + 1 / a;

  check("the grid agrees with the 1X2 on home", Math.abs(ph / tot - 1 / h / raw) < 0.02,
    `${(ph / tot).toFixed(3)} vs ${(1 / h / raw).toFixed(3)}`);
  check("the grid agrees with the 1X2 on the draw", Math.abs(pd / tot - 1 / d / raw) < 0.02);
  check("the grid agrees with the 1X2 on away", Math.abs(pa / tot - 1 / a / raw) < 0.02);

  // A favourite must shorten its own scorelines.
  const fav = correctScoreMarket(1.35, 5.0, 9.0);
  const twoNil = fav.prices.find((p) => p.outcome === "2:0")!;
  const nilTwo = fav.prices.find((p) => p.outcome === "0:2")!;
  check("a home favourite prices 2-0 shorter than 0-2", twoNil.odds < nilTwo.odds,
    `${twoNil.odds} vs ${nilTwo.odds}`);

  const [oe, eg] = goalCountMarkets(h, d, a);
  check("odd/even is produced", oe.key === "oe" && oe.prices.length === 2);
  check("exact goals is produced", eg.key === "eg" && eg.prices.length > 3);
  check("exact goals carries a 6+ bucket", eg.prices.some((p) => p.outcome === "6+"));
}

console.log(LOYALTY_HEADING);
{
  const rookie = standing(0);
  check("no turnover starts at the bottom tier", rookie.current.name === "Rookie");
  check("the next tier is named", rookie.next?.name === "Golden Boy");
  check("progress starts at zero", rookie.progress === 0);
  check("nothing is earned at the bottom rate", rookie.potentialReward === 0);

  const golden = standing(204);
  check("204 points is Golden Boy", golden.current.name === "Golden Boy", golden.current.name);
  check("Captain is next", golden.next?.name === "Captain");
  check("1,796 points to Captain", golden.toNext === 1796, String(golden.toNext));
  check("progress sits inside the band", golden.progress > 0 && golden.progress < 1);
  check("a reward accrues once past the first tier", golden.potentialReward > 0);

  const exact = standing(2000);
  check("landing exactly on a threshold promotes", exact.current.name === "Captain", exact.current.name);

  const top = standing(1_000_000);
  check("the top tier has no next", top.next === null);
  check("the top tier reads as complete", top.progress === 1);
  check("the top tier still needs nothing", top.toNext === 0);

  const negative = standing(-50);
  check("negative turnover is floored, not crashed", negative.points === 0);

  check("every tier is ordered by threshold",
    TIERS.every((t, i2) => i2 === 0 || t.at > TIERS[i2 - 1].at));

  check("a phone is masked", maskPhone("233501234586") === "50******6", maskPhone("233501234586"));
  check("a short value is left alone", maskPhone("12") === "12");
}

console.log(SLIP_HEADING);
{
  // A short leg does not count toward the bonus, which is what stops a ticket
  // being padded with 1.01 shots to buy the rate without taking any risk.
  const padded = bonusFor([2.0, 1.8, 1.05]);
  check("a leg under the qualifying price does not count", padded.qualifying === 2, String(padded.qualifying));
  check("two qualifying legs earn nothing", padded.rate === 0);

  const three = bonusFor([2.0, 1.8, 1.5]);
  check("three qualifying legs earn a bonus", three.rate > 0, String(three.rate));

  const ten = bonusFor(Array(10).fill(1.5));
  const twelve = bonusFor(Array(12).fill(1.5));
  check("the rate rises with the leg count", twelve.rate > ten.rate);

  const single = bonusFor([2.5]);
  check("a single earns no bonus", single.rate === 0);
  check("it reports how many more legs are needed", single.toNext > 0);

  // The bonus is a share of the profit, never of the stake coming back.
  const amount = bonusAmount(100, 3.0, [1.5, 1.5, 1.4]);
  check("the bonus is taken from the profit", amount > 0 && amount < 200, String(amount));
  check("a losing-shaped ticket pays no bonus", bonusAmount(100, 1.0, [1.5, 1.5, 1.4]) === 0);
  check("the return includes the bonus", potentialWin(100, 3.0, [1.5, 1.5, 1.4]) > 300);
  check("no bonus means the plain return", potentialWin(100, 2.0, [2.0]) === 200);

  // System lines.
  check("2 from 4 is six lines", combinationCount(4, 2) === 6);
  check("3 from 5 is ten lines", combinationCount(5, 3) === 10);
  check("n from n is one line", combinationCount(4, 4) === 1);

  const combos = combinations([1, 2, 3, 4], 2);
  check("the combinations are actually built", combos.length === 6, String(combos.length));
  check("every combination is the right size", combos.every((c) => c.length === 2));
  check("no combination repeats a selection",
    combos.every((c) => new Set(c).size === c.length));
  check("no two combinations are the same",
    new Set(combos.map((c) => c.join(","))).size === combos.length);

  check("a system needs three selections", systemSizes(2).length === 0);
  check("four selections offer 2/4 and 3/4",
    systemSizes(4).join(",") === "2,3", systemSizes(4).join(","));
  check("a full-cover size is not offered as a system", !systemSizes(4).includes(4));
}

console.log(RESOLVE_HEADING);
{
  // What a fixture looks like once the real book has priced it.
  const upstream = buildMarkets([
    {
      id: 1,
      name: "Book",
      bets: [
        { id: 1, name: "Match Winner", values: [
          { value: "Home", odd: "3.16" }, { value: "Draw", odd: "3.22" }, { value: "Away", odd: "2.90" },
        ] },
        { id: 12, name: "Double Chance", values: [
          { value: "Home/Draw", odd: "1.56" }, { value: "Home/Away", odd: "1.35" }, { value: "Draw/Away", odd: "1.36" },
        ] },
        { id: 5, name: "Goals Over/Under", values: [
          { value: "Over 2.5", odd: "1.81" }, { value: "Under 2.5", odd: "1.97" },
        ] },
        { id: 8, name: "Both Teams Score", values: [
          { value: "Yes", odd: "1.91" }, { value: "No", odd: "1.87" },
        ] },
      ],
    },
  ]);

  // The exact case that failed on the deployed site: tapped on the board as
  // 1x2 / "2", submitted against a fixture the real book had priced as af1.
  const away = resolveSelection(upstream, "1x2", "2");
  check("a board Away pick resolves to the book's Away", away?.price.outcome === "Away", String(away?.price.outcome));
  check("and carries the book's price", away?.price.odds === 2.9, String(away?.price.odds));

  check("board Home resolves", resolveSelection(upstream, "1x2", "1")?.price.outcome === "Home");
  check("board Draw resolves", resolveSelection(upstream, "1x2", "X")?.price.outcome === "Draw");

  check("double chance 1X resolves",
    resolveSelection(upstream, "dc", "1X")?.price.outcome === "Home/Draw");
  check("double chance X2 resolves",
    resolveSelection(upstream, "dc", "X2")?.price.outcome === "Draw/Away");
  check("over 2.5 resolves",
    resolveSelection(upstream, "ou25", "O2.5")?.price.outcome === "Over 2.5");
  check("under 2.5 resolves",
    resolveSelection(upstream, "ou25", "U2.5")?.price.outcome === "Under 2.5");
  check("GG resolves to Yes", resolveSelection(upstream, "btts", "GG")?.price.outcome === "Yes");
  check("NG resolves to No", resolveSelection(upstream, "btts", "NG")?.price.outcome === "No");

  // The other direction: a detail-page pick placed while only the derived
  // board markets are live, which happens if upstream odds drop out.
  const derived = deriveMarkets(3.16, 3.22, 2.9);
  check("a book Away pick resolves back to the board",
    resolveSelection(derived, "af1", "Away")?.price.outcome === "2");
  check("a book Home/Draw resolves back to the board",
    resolveSelection(derived, "af12", "Home/Draw")?.price.outcome === "1X");

  // Exactness still wins where it can.
  check("an exact match is used unchanged",
    resolveSelection(derived, "1x2", "2")?.price.outcome === "2");

  // And a genuinely absent market still refuses.
  check("an unknown market refuses", resolveSelection(upstream, "af999", "Home") === null);
  check("a nonsense outcome refuses", resolveSelection(upstream, "1x2", "banana") === null);
  check("a market not on this fixture refuses",
    resolveSelection(upstream, "cs", "2:1") === null);
}

console.log(CASHOUT_HEADING);
{
  const leg = (p: Partial<CashoutLeg>): CashoutLeg => ({
    state: "pending",
    odds: 2,
    currentOdds: 2,
    live: false,
    ...p,
  });

  // Nothing has moved: the offer is the stake back, less the margin.
  const flat = cashoutOffer(100, 400, [leg({}), leg({})]);
  check("a ticket with unmoved prices offers about the stake",
    Math.abs(flat.amount - 100 * (1 - CASHOUT_MARGIN)) < 0.02, String(flat.amount));

  // A leg already won is banked, so the offer rises.
  const oneWon = cashoutOffer(100, 400, [leg({ state: "won" }), leg({})]);
  check("a won leg raises the offer", oneWon.amount > flat.amount,
    `${oneWon.amount} vs ${flat.amount}`);

  // A shortening price means the remaining leg is likelier, so the offer rises.
  const shortened = cashoutOffer(100, 400, [leg({ state: "won" }), leg({ currentOdds: 1.2 })]);
  check("a shortening price raises the offer", shortened.amount > oneWon.amount,
    `${shortened.amount} vs ${oneWon.amount}`);

  // A drifting price means it is less likely, so the offer falls.
  const drifted = cashoutOffer(100, 400, [leg({ state: "won" }), leg({ currentOdds: 6 })]);
  check("a drifting price lowers the offer", drifted.amount < oneWon.amount,
    `${drifted.amount} vs ${oneWon.amount}`);

  // The offer can never exceed what the ticket could actually pay.
  const capped = cashoutOffer(100, 150, [leg({ state: "won" }), leg({ currentOdds: 1.01 })]);
  check("the offer never exceeds the potential win", capped.amount <= 150, String(capped.amount));

  // The book keeps its margin: an offer always sits under fair value, which is
  // the full payout weighted by the chance of collecting it.
  const nearCertain = 1.0001;
  const fair = 400 * (1 / nearCertain);
  const marginKept = cashoutOffer(100, 400, [leg({ state: "won" }), leg({ currentOdds: nearCertain })]);
  check("the offer sits under fair value", marginKept.amount < fair,
    `${marginKept.amount} vs ${fair.toFixed(2)}`);
  check("and keeps roughly the stated margin",
    Math.abs(marginKept.amount - fair * (1 - CASHOUT_MARGIN)) < 0.05, String(marginKept.amount));

  console.log("  --- refusals ---");
  check("a lost leg refuses",
    cashoutOffer(100, 400, [leg({ state: "lost" }), leg({})]).reason === "leg-lost");
  check("an in-play leg refuses",
    cashoutOffer(100, 400, [leg({ live: true }), leg({})]).reason === "in-play");
  check("an unpriced leg refuses",
    cashoutOffer(100, 400, [leg({ currentOdds: null }), leg({})]).reason === "no-live-price");
  check("a fully won ticket refuses — it is a winner, not a cashout",
    cashoutOffer(100, 400, [leg({ state: "won" }), leg({ state: "won" })]).reason === "already-decided");
  check("an empty ticket refuses", cashoutOffer(100, 400, []).reason === "already-decided");
  check("a worthless offer refuses",
    cashoutOffer(1, 400, [leg({ currentOdds: 50 }), leg({ currentOdds: 50 })]).reason === "too-small");
  check("every refusal offers zero",
    cashoutOffer(100, 400, [leg({ state: "lost" })]).amount === 0);
}

console.log("");
console.log("Live card filtering and phone handling");
{
  check("a youth competition is kept off the live card", isMinorCompetition("Youth Championship"));
  check("a U21 competition is kept off", isMinorCompetition("Premier League U21"));
  check("a U19 competition is kept off", isMinorCompetition("Central Youth League U19"));
  check("a reserve competition is kept off", isMinorCompetition("Reserve League"));
  check("an academy competition is kept off", isMinorCompetition("Academy League"));

  check("a senior second tier is kept", !isMinorCompetition("K League 2"));
  check("a women's league is kept", !isMinorCompetition("WK-League"));
  check("a top flight is kept", !isMinorCompetition("Bundesliga"));
  check("a state league is kept", !isMinorCompetition("South Australia State League 1"));
  // The word boundary matters: "u21" standing alone is a youth grade, the same
  // letters inside another word are not.
  check("a standalone U23 is kept off", isMinorCompetition("U23 Development League"));
  check("digits after an unrelated word are kept", !isMinorCompetition("Club 23 Premier"));
  check("u inside a word does not trip it", !isMinorCompetition("Sudamericana 21"));

  // These guard against escape sequences being mangled on the way into source:
  // a broken pattern here silently mis-filters or breaks sign-up.
  check("a local number normalises", normalisePhone("0531234086", "GH") === "233531234086",
    String(normalisePhone("0531234086", "GH")));
  check("an international number normalises",
    normalisePhone("+233531234086", "GH") === "233531234086");
  check("a short number is rejected", normalisePhone("12345", "GH") === null);
  check("a phone masks to its tail", maskPhoneTail("233531234086") === "53****086",
    maskPhoneTail("233531234086"));
}

console.log("");
console.log("Match tracker event classification");
{
  check("a normal goal is a goal", classifyEvent("Goal", "Normal Goal") === "goal");
  check("a penalty scored is a goal", classifyEvent("Goal", "Penalty") === "goal");
  check("an own goal is a goal", classifyEvent("Goal", "Own Goal") === "goal");

  // The feed files a missed penalty under Goal. Counting it put more markers on
  // the pitch than the scoreline had goals.
  check("a missed penalty is not a goal", classifyEvent("Goal", "Missed Penalty") !== "goal",
    classifyEvent("Goal", "Missed Penalty"));

  check("a yellow card is a card", classifyEvent("Card", "Yellow Card") === "card");
  check("a red card is a card", classifyEvent("Card", "Red Card") === "card");
  check("a substitution is a sub", classifyEvent("subst", "Substitution 1") === "sub");
  check("a VAR check is var", classifyEvent("Var", "Goal cancelled") === "var");
  check("anything unknown falls back to other", classifyEvent("Whatever", "") === "other");
}

console.log(failures === 0 ? "\nAll rule checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
