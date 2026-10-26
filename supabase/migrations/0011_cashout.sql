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
