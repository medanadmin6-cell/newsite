# 3btafric

A sports-betting platform for African mobile-money markets. Players sign up with a phone number, deposit by mobile money, bet on football, and withdraw back to a mobile wallet or a bank account. An operator runs the book from an admin console, and partners earn commission on the deposits of players they refer.

One Next.js application on Vercel, with Supabase Postgres as the only database. There is no separate backend service: every rule below is enforced in a route handler or a library module in this repository.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4, one token layer in `app/globals.css` |
| Client state | Zustand — bet slip, session, popularity counts |
| Database | Supabase Postgres, server-side with the service-role key |
| File storage | Supabase Storage (deposit screenshots) |
| Fixtures & odds | API-Football v3, plus operator-created custom matches |
| Payments | Flutterwave, Korapay, Moolre, Paystack, and a manual mobile-money rail |
| Messaging | Arkesel SMS, Web Push for goal alerts |

The service-role key bypasses row-level security, so every database read and write happens on the server. No table is ever queried from the browser.

## Getting started

```bash
cp .env.example .env.local     # fill in what your deployment needs
npm install
npm run dev
```

Then, in the Supabase SQL editor, run `supabase/setup-all.sql` followed by `supabase/storage.sql`. Both are idempotent and safe to re-run.

The app starts without any of it: with no database it serves upstream fixtures only, with no `API_FOOTBALL_KEY` it serves custom matches only, and with no `ADMIN_PASSWORD` the console is disabled outright.

## Where things live

```
lib/
  money.ts        applyDepositCredit — the one way money enters a wallet
  settle.ts       automatic settlement, safe to run concurrently
  withdrawals.ts  the three-gate withdrawal rule, shared everywhere it appears
  countries.ts    per-country currency, KYC, gateway, payout rail, gate
  fixtures.ts     the merged public feed
  clock.ts        the match clock every other module agrees with
  odds.ts         derived markets and live drift
  gateways.ts     one adapter per payment rail
app/api/          route handlers
app/admin/        the operator console
app/partner/      the partner dashboard
supabase/         migrations, concatenated into setup-all.sql
```

Rebuild `setup-all.sql` after adding a migration with `sh scripts/build-setup.sh`.

## The rules this code enforces

### Money in

Every rail without exception funnels into `applyDepositCredit`, which does five things in order:

1. Credit the wallet and update the lifetime deposited total, stamping the first-deposit timestamp if this is the player's first.
2. Pay a one-time welcome bonus on the first confirmed deposit. The bonus is a pure gift: it does not count toward verification or commission.
3. Pay referral commission — 70% of the deposit, on every deposit, not just the first — if the player was referred by an approved partner. Retried once; a permanent failure is logged loudly for manual backfill rather than failing the deposit.
4. Advance the verification step, capped at 4, when the deposit meets the country's verification amount.
5. Count the deposit toward the withdrawal gate when it meets the qualifying amount, then send the payment-received SMS.

Steps 2 to 5 are all best-effort. The money is already in the wallet by the time they run, so a failure in any of them is logged and swallowed rather than rolling back a credited deposit.

Credits are idempotent: a payment reference can only ever credit once, guarded by a conditional update that only one concurrent run can win.

### Money out

Three gates in order, and the player only sees the first one they fail.

1. **Payout details.** Mobile-money markets need a valid wallet number for the country; bank markets need an account number and a bank name.
2. **The deposit gate.** Withdrawals unlock after three separate qualifying deposits — GHS 300 or more in Ghana, each other market's own amount elsewhere. Deposits are *counted, not summed*, so paying the whole qualifying sum in one deposit unlocks nothing. Set `WITHDRAW_QUALIFY_COUNT_<CC>=0` to drop a market back to the cumulative-total rule.
3. **Operator approval.** Even a fully qualified player needs the approval flag. Rather than showing a lock screen, the app records the request as a pending payment and tells the player it is being processed.

`lib/withdrawals.ts` is the single source of that rule, read by the withdraw sheet, the withdrawal endpoint and the admin players list alike — so the console can never offer Approve to someone the endpoint would still block.

### Settlement

Automatic, running from four places that all call the same function and are all safe to run concurrently:

- the fixture feed, throttled to once every 25 seconds — so while the site has any traffic at all, finished matches settle within about half a minute;
- a player opening My Bets, settling just their own tickets;
- an operator opening the admin bets list, settling everything;
- a daily Vercel cron as a backstop for a site with no traffic.

Only the match-result (1X2) market is judged automatically, and only off a final score — which in practice means custom matches and any upstream fixture the operator has scored by hand. Any leg the system cannot judge with certainty stays pending rather than being guessed at.

A ticket is lost the moment any leg is definitively lost; won only when every leg is won. A guarded update makes double-crediting impossible: only the run that actually transitions the ticket out of pending pays out. Each judged leg stores the final score it was judged on, which is what lets a settled ticket show the player how the match finished rather than just a green or red dot.

### Fixtures

The feed merges upstream API-Football fixtures — whitelisted to about forty competitions, cached 60 seconds — with operator-created custom matches. Finished matches are filtered out of both. Operator overrides are layered on top of whichever source a fixture came from. Any market upstream did not price is derived locally from 1X2, so the market selector always has something to show.

If Supabase is unavailable the custom matches are dropped and the upstream fixtures still render: the feed degrades to fewer matches, never to none.

The ticking clock is derived from the kickoff timestamp rather than the feed's whole minutes, and the same function decides whether a match is live, which half is running, and when it is over — so the clock, the lock rules and settlement agree by construction.

A custom match's odds move with its scoreline: the team in front shortens, the team behind drifts, and the swing grows with both the size of the lead and how late it is. This is presentational drama on operator-scripted fixtures. Live betting is locked, so no bet is ever struck at these shifted prices.

### Background work

Most of it rides on ordinary traffic rather than a scheduler, so the platform keeps working on a hosting plan with a minimal cron allowance.

| Job | Trigger | Throttle |
| --- | --- | --- |
| Settle finished bets | Fixture feed, My Bets, admin bets list, daily cron | 25s per instance |
| Goal alerts | Every fixture-feed poll | 15s per instance |
| Deposit reconciliation | Account screen load | None — idempotent |
| Popularity counts | First fixture list per page view | Once per page view |

## Known gaps

Written plainly, because these matter more than the features when deciding what to do next.

- **Player sessions are a user id in browser local storage**, passed to the API on each call. Anyone who learns another player's id can read that account's data through the API. This is the most significant security gap in the system and wants a real signed session before serious volume.
- **The admin console is a single shared password** with no individual accounts and no audit trail of who credited or approved what.
- **Automatic settlement covers the match-result market only**, and only for fixtures with a final score. Everything else waits for the operator.
- **The winners ticker on the home page is a marketing prop**: masked numbers and amounts are generated, not read from real settled tickets.
- **The in-app support chat answers from a fixed script.** It is not connected to a person or a model.
- **The settlement cron runs once a day**, not every minute. Settlement in practice depends on site traffic — fine while the site is busy, slow when it is not.
- **Web Push delivery is stubbed.** Goal alerts resolve their recipients and log the payload; wiring an actual push provider is a small, isolated change in `lib/goals.ts`.
- **Database migrations are applied by hand.** The app survives an un-run migration by falling back, but features stay dark until the SQL is run.

## Design

The interface follows the house style of the Ghanaian sportsbook market. The palette is three hues, defined once as tokens in `app/globals.css`: a petrol-teal ramp (185°) carrying every ground from the page (`#03272B`) up to the brand bar (`#08575E`), a coral accent (`#FF5252`) reserved for actions and active odds, and lime (`#93C738`) for wins and rising prices. There is no neutral grey anywhere structural — secondary text is a pale teal.

Two invariants are worth not breaking. An odds button is *darker* than the row it sits in (`--odds-btn` is the page ground); that inversion is what makes the board read. And the coral only reaches 2.6:1 against `--surface`, so it cannot carry text on the brand bar — use `--accent-soft` or white there.

The 3btafric wordmark and icons in `public/` are original to this project; team crests come from API-Football.
