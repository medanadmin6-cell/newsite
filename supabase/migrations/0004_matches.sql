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
