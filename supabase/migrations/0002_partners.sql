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
