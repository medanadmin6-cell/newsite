-- The site is Stakeza now. The name reached the database in two places: the
-- house league custom matches are filed under, and the account name shown on
-- the manual deposit screen. Both are carried over here so a running
-- deployment says the new name without anyone editing a row by hand.

alter table custom_matches alter column league set default 'Stakeza Special';

update custom_matches
   set league = 'Stakeza Special'
 where league = 'Betlixx Special';

update app_settings
   set value = 'Stakeza Ghana', updated_at = now()
 where key = 'deposit_account_name' and value = 'Betlixx Ghana';
