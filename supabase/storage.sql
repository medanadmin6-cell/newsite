-- Buckets.
--
-- Deposit screenshots are private: they are a player's payment record, read
-- only by the operator through short-lived signed URLs.
insert into storage.buckets (id, name, public)
values ('deposit-screenshots', 'deposit-screenshots', false)
on conflict (id) do nothing;

-- Team crests are public: they are rendered on the board for every visitor, so
-- signing a URL per crest per page view would be waste. The upload route is
-- admin-only and names the file itself, so nothing private lands here.
insert into storage.buckets (id, name, public)
values ('team-crests', 'team-crests', true)
on conflict (id) do nothing;
