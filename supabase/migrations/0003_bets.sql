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
