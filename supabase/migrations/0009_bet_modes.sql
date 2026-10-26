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
