-- 3btafric: all migrations concatenated. Idempotent, safe to re-run.
-- Generated from supabase/migrations/ — do not edit by hand.

-- ============ 0001_users.sql ============
-- Players. Country drives currency, KYC shape, gateway and payout rail.
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  email text unique,
  password_hash text not null,
  country_code text not null,
  currency text not null,
  kyc_value text,
  balance numeric(14,2) not null default 0,
  total_deposited numeric(14,2) not null default 0,
  total_withdrawn numeric(14,2) not null default 0,
  verification_step smallint not null default 0,
  qualifying_deposits smallint not null default 0,
  withdrawal_approved boolean not null default false,
  first_deposit_at timestamptz,
  bonus_paid boolean not null default false,
  referred_by uuid,
  payout_number text,
  payout_bank text,
  created_at timestamptz not null default now()
);

create index if not exists users_referred_by_idx on users (referred_by);
create index if not exists users_country_idx on users (country_code);

-- ============ 0002_partners.sql ============
-- Referral partners. Balances are held per currency, never summed across markets.
create table if not exists sub_admins (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  phone text,
  password_hash text not null,
  referral_code text not null unique,
  approved boolean not null default false,
  balances jsonb not null default '{}'::jsonb,
  lifetime jsonb not null default '{}'::jsonb,
  payout_name text,
  payout_network text,
  payout_number text,
  created_at timestamptz not null default now()
);

-- One row per commission payment, for audit and backfill.
create table if not exists commissions (
  id uuid primary key default gen_random_uuid(),
  sub_admin_id uuid not null references sub_admins(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  payment_reference text,
  deposit_amount numeric(14,2) not null,
  currency text not null,
  rate numeric(5,4) not null,
  amount numeric(14,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists commissions_sub_admin_idx on commissions (sub_admin_id);
create unique index if not exists commissions_reference_key
  on commissions (payment_reference) where payment_reference is not null;

do $$ begin
  alter table users add constraint users_referred_by_fkey
    foreign key (referred_by) references sub_admins(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ============ 0003_bets.sql ============
-- One row per ticket.
create table if not exists bets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  user_id uuid not null references users(id) on delete cascade,
  stake numeric(14,2) not null,
  total_odds numeric(10,3) not null,
  potential_win numeric(14,2) not null,
  currency text not null,
  status text not null default 'pending',
  payout numeric(14,2),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint bets_status_chk check (status in ('pending','won','lost','void'))
);

create index if not exists bets_user_idx on bets (user_id, created_at desc);
create index if not exists bets_status_idx on bets (status);

-- One row per leg.
create table if not exists bet_selections (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references bets(id) on delete cascade,
  match_id text not null,
  home_team text not null,
  away_team text not null,
  league text,
  market text not null,
  outcome text not null,
  odds numeric(10,3) not null,
  result text not null default 'pending',
  constraint bet_selections_result_chk check (result in ('pending','won','lost','void'))
);

create index if not exists bet_selections_bet_idx on bet_selections (bet_id);

-- ============ 0004_matches.sql ============
-- Operator-created fixtures, fully under operator control.
create table if not exists custom_matches (
  id uuid primary key default gen_random_uuid(),
  home_team text not null,
  away_team text not null,
  home_crest text,
  away_crest text,
  league text not null default 'Stakeza Special',
  sport text not null default 'football',
  kickoff timestamptz not null,
  odds_home numeric(10,3) not null,
  odds_draw numeric(10,3) not null,
  odds_away numeric(10,3) not null,
  goal_timeline jsonb not null default '[]'::jsonb,
  is_live boolean not null default false,
  is_locked boolean not null default false,
  best_odds boolean not null default false,
  final_home smallint,
  final_away smallint,
  finished boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists custom_matches_kickoff_idx on custom_matches (kickoff);

-- Operator corrections layered over upstream API fixtures.
create table if not exists match_overrides (
  match_id text primary key,
  score_home smallint,
  score_away smallint,
  minute smallint,
  is_live boolean,
  is_locked boolean,
  postponed boolean,
  updated_at timestamptz not null default now()
);

-- ============ 0005_payments.sql ============
-- Every deposit and withdrawal attempt across every rail.
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid not null references users(id) on delete cascade,
  amount numeric(14,2) not null,
  currency text not null,
  provider text not null,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint payments_status_chk check (status in ('pending','confirmed','failed','resolved'))
);

create index if not exists payments_user_idx on payments (user_id, created_at desc);
create index if not exists payments_status_idx on payments (status);
create index if not exists payments_type_idx on payments ((metadata->>'type'));

-- Saved slips, shareable by code.
create table if not exists bookings (
  code text primary key,
  selections jsonb not null,
  created_by uuid references users(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============ 0006_settings_push.sql ============
create table if not exists app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

-- Last score alerted per match, so a goal is never announced twice.
create table if not exists goal_notifications (
  match_id text primary key,
  last_home smallint not null default 0,
  last_away smallint not null default 0,
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value) values
  ('deposit_account_name', 'Stakeza Ghana'),
  ('deposit_account_number', '0244000000'),
  ('deposit_account_network', 'MTN Mobile Money')
on conflict (key) do nothing;

-- ============ 0007_selection_context.sql ============
-- Match context on each leg, so a settled ticket can show the player how the
-- match actually finished rather than only a green or red dot.
alter table bet_selections add column if not exists sport text not null default 'football';
alter table bet_selections add column if not exists kickoff timestamptz;
alter table bet_selections add column if not exists final_home smallint;
alter table bet_selections add column if not exists final_away smallint;

-- ============ 0008_partner_wallet.sql ============
-- A partner's own betting account.
--
-- Partners earn commission but previously had no way to use it: the only exit
-- was the operator settling up by hand. Linking a partner to a player row lets
-- them move earnings into a wallet, bet with it, and switch back to the
-- dashboard at any time. Both sessions are independent, so neither logs the
-- other out.
alter table sub_admins add column if not exists user_id uuid references users(id) on delete set null;

-- One betting account per partner, and one partner per betting account.
create unique index if not exists sub_admins_user_id_key
  on sub_admins (user_id) where user_id is not null;

-- Lets the player screens ask "is this player a partner?" without a scan.
create index if not exists users_partner_lookup_idx on sub_admins (user_id);

-- ============ 0009_bet_modes.sql ============
-- Ticket modes and the accumulator bonus.
--
-- A slip can now be placed three ways: a single per selection, one multiple
-- across all of them, or a system covering every combination of a given size.
-- Singles and system lines are written as separate tickets sharing a group id,
-- so each settles independently while the player still sees them as one slip.
alter table bets add column if not exists mode text not null default 'multiple';
alter table bets add column if not exists bonus numeric(14,2) not null default 0;
alter table bets add column if not exists group_code text;

do $$ begin
  alter table bets add constraint bets_mode_chk check (mode in ('single','multiple','system'));
exception when duplicate_object then null; end $$;

create index if not exists bets_group_idx on bets (group_code) where group_code is not null;

-- ============ 0010_booking_share.sql ============
-- Booking codes shared on a player's personal page.
--
-- A booking is private by default. Turning sharing on lists the code publicly
-- on the player's page so other people can load the same selections.
alter table bookings add column if not exists shared boolean not null default false;

create index if not exists bookings_shared_idx
  on bookings (created_by, created_at desc) where shared;

-- ============ 0011_cashout.sql ============
-- Cashing out an open ticket.
--
-- A player can take a settled value now instead of waiting for the remaining
-- legs. The ticket leaves the pending pool for good, so settlement must never
-- pay it a second time: 'cashed_out' is a terminal state alongside won and lost.
alter table bets add column if not exists cashout_amount numeric(14,2);
alter table bets add column if not exists cashed_out_at timestamptz;

-- Widen the status check to admit the new terminal state.
do $$ begin
  alter table bets drop constraint if exists bets_status_chk;
  alter table bets add constraint bets_status_chk
    check (status in ('pending','won','lost','void','cashed_out'));
exception when others then null; end $$;

-- ============ 0012_rename_stakeza.sql ============
-- The site is Stakeza now. The name reached the database in two places: the
-- house league custom matches are filed under, and the account name shown on
-- the manual deposit screen. Both are carried over here so a running
-- deployment says the new name without anyone editing a row by hand.

alter table custom_matches alter column league set default 'Stakeza Special';

update custom_matches
   set league = 'Stakeza Special'
 where league = 'Betlixx Special';

update app_settings
   set value = 'Stakeza Ghana', updated_at = now()
 where key = 'deposit_account_name' and value = 'Betlixx Ghana';

-- ============ 0013_rename_3btafric.sql ============
-- The site is 3btafric now. Same two places the name reaches the database as
-- in 0012: the house league custom matches are filed under, and the account
-- name shown on the manual deposit screen.
--
-- The updates match on both prior names, so a deployment that never ran 0012
-- and one that did both land on the same rows.

alter table custom_matches alter column league set default '3btafric Special';

update custom_matches
   set league = '3btafric Special'
 where league in ('Stakeza Special', 'Betlixx Special');

update app_settings
   set value = '3btafric Ghana', updated_at = now()
 where key = 'deposit_account_name'
   and value in ('Stakeza Ghana', 'Betlixx Ghana');

-- ============ 0014_grants.sql ============
-- Table privileges for the service role.
--
-- Older Supabase projects handed every new table in `public` to anon,
-- authenticated and service_role through default privileges, so the schema
-- never had to say anything about grants. Projects created more recently do
-- not: a table lands with no role privileges at all, and PostgREST answers
-- every request with `42501 permission denied`, which surfaces in the app as
-- "Could not create your account".
--
-- This app talks to Postgres only as the service role, from route handlers and
-- server components (see lib/supabase.ts). So the service role is the only one
-- granted anything here — anon and authenticated stay with no access to any
-- table, which is what we want for a schema holding balances and payments.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;

-- Tables added by later migrations, so this file does not have to be re-run.
-- Default privileges attach to the role that runs the statement, which is the
-- same role that runs the migrations.
alter default privileges in schema public grant all on tables to service_role;

-- Belt and braces. The service role bypasses row-level security, so this
-- changes nothing for the app; it means a table that somehow did pick up a
-- grant for anon still exposes no rows without an explicit policy.
do $$
  declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ============ 0015_verification_topup.sql ============
-- One more deposit after the counted verification deposits.
--
-- The counted deposits (six of GHS 200 in Ghana, and the same idea in the
-- other markets) are not the last payment. Once those are already on the
-- account, the next deposit of the country's verification amount — GHS 300
-- in Ghana — is what finishes verification. A deposit that itself completes
-- the count does not count as this one.
alter table users add column if not exists verification_topup boolean not null default false;

