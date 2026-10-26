-- Match context on each leg, so a settled ticket can show the player how the
-- match actually finished rather than only a green or red dot.
alter table bet_selections add column if not exists sport text not null default 'football';
alter table bet_selections add column if not exists kickoff timestamptz;
alter table bet_selections add column if not exists final_home smallint;
alter table bet_selections add column if not exists final_away smallint;
