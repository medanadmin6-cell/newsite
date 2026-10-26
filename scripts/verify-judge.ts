/**
 * Settlement judging checks. Run with: npm run verify:judge
 *
 * These matter more than the rest of the suite: a wrong verdict here credits or
 * withholds real money. Every "cannot decide" case is asserted too, because
 * silently guessing is the failure mode that actually costs an operator.
 */
import { judge, canJudge, JUDGED_MARKET_COUNT, CORNER_MARKETS } from "../lib/judge";
import type { MatchResult } from "../lib/results";

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

function res(p: Partial<MatchResult> & { home: number; away: number }): MatchResult {
  return {
    htHome: null,
    htAway: null,
    cornersHome: null,
    cornersAway: null,
    finished: true,
    ...p,
  };
}

// 3-1 at full time, 1-1 at the break, 11 corners split 4-7.
const m = res({ home: 3, away: 1, htHome: 1, htAway: 1, cornersHome: 4, cornersAway: 7 });
const goalless = res({ home: 0, away: 0, htHome: 0, htAway: 0 });
const drawn = res({ home: 2, away: 2, htHome: 0, htAway: 1 });
const noHt = res({ home: 3, away: 1 });

console.log(`\nRegistry (${JUDGED_MARKET_COUNT} market families)`);
check("1X2 is judged", canJudge("af1"));
check("the derived 1x2 is judged", canJudge("1x2"));
check("corners over/under is judged", canJudge("af45"));
check("an unknown market is not judged", !canJudge("af999"));
check("corner markets are flagged for stat fetching", CORNER_MARKETS.has("af45"));

console.log("\nMatch result");
check("home wins 3-1", judge("af1", "Home", m) === true);
check("away loses 3-1", judge("af1", "Away", m) === false);
check("draw loses 3-1", judge("af1", "Draw", m) === false);
check("derived 1 wins", judge("1x2", "1", m) === true);
check("derived X loses", judge("1x2", "X", m) === false);
check("draw wins on 2-2", judge("af1", "Draw", drawn) === true);

console.log("\nDraw no bet");
check("home wins", judge("af2", "Home", m) === true);
check("a draw stays pending — it voids, it does not lose", judge("af2", "Home", drawn) === null);

console.log("\nDouble chance");
check("Home/Draw wins on a home win", judge("af12", "Home/Draw", m) === true);
check("Draw/Away loses on a home win", judge("af12", "Draw/Away", m) === false);
check("Draw/Away wins on a draw", judge("af12", "Draw/Away", drawn) === true);
check("1X shorthand resolves", judge("af12", "1X", m) === true);

console.log("\nGoals");
check("over 2.5 wins on 4 goals", judge("af5", "Over 2.5", m) === true);
check("under 2.5 loses on 4 goals", judge("af5", "Under 2.5", m) === false);
check("over 3.5 wins on 4 goals", judge("af5", "Over 3.5", m) === true);
check("over 4.5 loses on 4 goals", judge("af5", "Over 4.5", m) === false);
check("a whole line landing exactly stays pending (push)", judge("af5", "Over 4", m) === null);
check("a quarter line stays pending (split stake)", judge("af5", "Over 3.75", m) === null);
check("BTTS yes wins on 3-1", judge("af8", "Yes", m) === true);
check("BTTS yes loses on 0-0", judge("af8", "Yes", goalless) === false);
check("BTTS no wins on 0-0", judge("af8", "No", goalless) === true);
check("even wins on 4 goals", judge("af21", "Even", m) === true);
check("odd loses on 4 goals", judge("af21", "Odd", m) === false);
check("exact goals 4 wins", judge("af38", "4", m) === true);
check("exact goals 3 loses", judge("af38", "3", m) === false);

console.log("\nCorrect score");
check("3:1 wins", judge("af10", "3:1", m) === true);
check("1:3 loses — order matters", judge("af10", "1:3", m) === false);
check("a dash separator resolves", judge("af10", "3-1", m) === true);
check("nonsense stays pending", judge("af10", "banana", m) === null);

console.log("\nTeam markets");
check("home total over 2.5 wins on 3", judge("af16", "Over 2.5", m) === true);
check("away total over 2.5 loses on 1", judge("af17", "Over 2.5", m) === false);
check("home clean sheet loses, having conceded", judge("af27", "Yes", m) === false);
check("home clean sheet wins on 0-0", judge("af27", "Yes", goalless) === true);
check("home scored a goal", judge("af43", "Yes", m) === true);
check("win to nil loses, having conceded", judge("af29", "Yes", m) === false);
check("scoring draw loses on 0-0", judge("af110", "Yes", goalless) === false);
check("scoring draw wins on 2-2", judge("af110", "Yes", drawn) === true);

console.log("\nCombination markets");
check("Home/Yes wins on 3-1", judge("af24", "Home/Yes", m) === true);
check("Home/No loses on 3-1", judge("af24", "Home/No", m) === false);
check("o/yes 2.5 wins on 3-1", judge("af49", "o/yes 2.5", m) === true);
check("u/yes 2.5 loses on 3-1", judge("af49", "u/yes 2.5", m) === false);

console.log("\nHandicap");
check("Home -1 wins: 2-1 adjusted", judge("af9", "Home -1", m) === true);
check("Home -2 loses: adjusts to a draw", judge("af9", "Home -2", m) === false);
check("Draw -2 wins: 1-1 adjusted", judge("af9", "Draw -2", m) === true);
check("Away -1 loses", judge("af9", "Away -1", m) === false);

console.log("\nHalf markets");
check("first half draw wins at 1-1", judge("af13", "Draw", m) === true);
check("first half home loses at 1-1", judge("af13", "Home", m) === false);
check("first half over 1.5 wins on 2", judge("af6", "Over 1.5", m) === true);
check("first half BTTS yes wins at 1-1", judge("af34", "Yes", m) === true);
check("second half home wins: 2-0", judge("af3", "Home", m) === true);
check("second half over 1.5 wins on 2", judge("af26", "Over 1.5", m) === true);
check("second half BTTS no wins: 2-0", judge("af35", "No", m) === true);
check("HT/FT Draw/Home wins", judge("af7", "Draw/Home", m) === true);
check("HT/FT Home/Home loses", judge("af7", "Home/Home", m) === false);
check("highest scoring half is equal, 2 and 2", judge("af11", "Equal", m) === true);
check("win both halves loses, drew the first", judge("af32", "Home", m) === false);
check("win either half wins, took the second", judge("af39", "Home", m) === true);
check("home scored in both halves", judge("af111", "Yes", m) === true);
check("away did not score in both halves", judge("af112", "Yes", m) === false);

console.log("\nHalf markets with no half-time score");
check("first half result stays pending", judge("af13", "Home", noHt) === null);
check("HT/FT stays pending", judge("af7", "Draw/Home", noHt) === null);
check("second half stays pending", judge("af3", "Home", noHt) === null);

console.log("\nCorners");
check("corners over 9.5 wins on 11", judge("af45", "Over 9.5", m) === true);
check("corners under 9.5 loses on 11", judge("af45", "Under 9.5", m) === false);
check("corners 1X2 away wins at 4-7", judge("af55", "Away", m) === true);
check("home corners over 4.5 loses on 4", judge("af57", "Over 4.5", m) === false);
check("corners stay pending with no stats", judge("af45", "Over 9.5", noHt) === null);

console.log("\nRefusals");
const unfinished = res({ home: 3, away: 1, finished: false });
check("an unfinished match never settles", judge("af1", "Home", unfinished) === null);
check("an unknown market never settles", judge("af999", "Home", m) === null);
check("an unparsable side never settles", judge("af1", "Maybe", m) === null);
check("an unparsable line never settles", judge("af5", "Over lots", m) === null);

console.log(failures === 0 ? "\nAll judge checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
