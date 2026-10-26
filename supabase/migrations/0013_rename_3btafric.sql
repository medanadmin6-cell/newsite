-- The site is 3btafric now. Same two places the name reaches the database as
-- in 0012: the house league custom matches are filed under, and the account
-- name shown on the manual deposit screen.
--
-- The updates match on both prior names, so a deployment that never ran 0012
-- and one that did both land on the same rows.

alter table custom_matches alter column league set default '3btafric Special';

update custom_matches
   set league = '3btafric Special'
 where league in ('Stakeza Special', 'Betlixx Special');

update app_settings
   set value = '3btafric Ghana', updated_at = now()
 where key = 'deposit_account_name'
   and value in ('Stakeza Ghana', 'Betlixx Ghana');
