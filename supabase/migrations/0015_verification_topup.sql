-- One more deposit after the counted verification deposits.
--
-- The counted deposits (six of GHS 200 in Ghana, and the same idea in the
-- other markets) are not the last payment. Once those are already on the
-- account, the next deposit of the country's verification amount — GHS 300
-- in Ghana — is what finishes verification. A deposit that itself completes
-- the count does not count as this one.
alter table users add column if not exists verification_topup boolean not null default false;
