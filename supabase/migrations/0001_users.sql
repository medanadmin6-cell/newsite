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
