-- A partner's own betting account.
--
-- Partners earn commission but previously had no way to use it: the only exit
-- was the operator settling up by hand. Linking a partner to a player row lets
-- them move earnings into a wallet, bet with it, and switch back to the
-- dashboard at any time. Both sessions are independent, so neither logs the
-- other out.
alter table sub_admins add column if not exists user_id uuid references users(id) on delete set null;

-- One betting account per partner, and one partner per betting account.
create unique index if not exists sub_admins_user_id_key
  on sub_admins (user_id) where user_id is not null;

-- Lets the player screens ask "is this player a partner?" without a scan.
create index if not exists users_partner_lookup_idx on sub_admins (user_id);
