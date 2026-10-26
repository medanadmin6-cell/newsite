-- Booking codes shared on a player's personal page.
--
-- A booking is private by default. Turning sharing on lists the code publicly
-- on the player's page so other people can load the same selections.
alter table bookings add column if not exists shared boolean not null default false;

create index if not exists bookings_shared_idx
  on bookings (created_by, created_at desc) where shared;
