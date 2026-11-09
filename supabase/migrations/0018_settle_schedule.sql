-- Settle finished bets every minute, whatever the hosting plan.
--
-- Vercel's Hobby plan only allows a daily cron, so a quiet site used to leave
-- full-time tickets pending until 03:00. Supabase runs the schedule instead:
-- pg_cron fires once a minute and pg_net calls /api/cron/settle.
--
-- The site address and the cron secret are read from Supabase Vault, so they
-- never sit in this file. Until `site_url` is stored the job does nothing.
-- Store them once in the SQL editor (use your real values):
--
--   select vault.create_secret('https://your-site.vercel.app', 'site_url');
--   select vault.create_secret('<the CRON_SECRET set on Vercel>', 'cron_secret');
--
-- To change one later: select vault.update_secret(id, 'new value')
--   (the id is in vault.secrets where name = 'site_url').
--
-- Safe to re-run: scheduling an existing job name replaces it.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'settle-bets',
  '* * * * *',
  $job$
  select net.http_get(
    url := rtrim(s.site_url, '/') || '/api/cron/settle',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || coalesce(s.cron_secret, '')
    ),
    timeout_milliseconds := 60000
  )
  from (
    select
      (select decrypted_secret from vault.decrypted_secrets where name = 'site_url') as site_url,
      (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret') as cron_secret
  ) s
  where s.site_url is not null and s.site_url <> '';
  $job$
);
