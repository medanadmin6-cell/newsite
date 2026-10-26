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
