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
