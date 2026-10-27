-- The site is Betvanta now. Same two places the name reaches the database:
-- the house league custom matches are filed under, and the account name
-- shown on the manual deposit screen when it is still a previous brand default.

alter table custom_matches alter column league set default 'Betvanta Special';

update custom_matches
   set league = 'Betvanta Special'
 where league in ('3btafric Special', 'Velora Special', 'Stakeza Special', 'Betlixx Special');

update app_settings
   set value = 'Betvanta', updated_at = now()
 where key = 'deposit_account_name'
   and value in ('3btafric Ghana', 'Velora', 'Velora Ghana', 'Stakeza Ghana', 'Betlixx Ghana');
