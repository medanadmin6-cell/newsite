-- Which partner created a custom match. Null means the operator created it.
-- A partner can list and change only their own rows.
alter table custom_matches
  add column if not exists created_by uuid references sub_admins (id) on delete set null;

create index if not exists custom_matches_created_by_idx on custom_matches (created_by);
