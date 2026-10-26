-- Table privileges for the service role.
--
-- Older Supabase projects handed every new table in `public` to anon,
-- authenticated and service_role through default privileges, so the schema
-- never had to say anything about grants. Projects created more recently do
-- not: a table lands with no role privileges at all, and PostgREST answers
-- every request with `42501 permission denied`, which surfaces in the app as
-- "Could not create your account".
--
-- This app talks to Postgres only as the service role, from route handlers and
-- server components (see lib/supabase.ts). So the service role is the only one
-- granted anything here — anon and authenticated stay with no access to any
-- table, which is what we want for a schema holding balances and payments.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;

-- Tables added by later migrations, so this file does not have to be re-run.
-- Default privileges attach to the role that runs the statement, which is the
-- same role that runs the migrations.
alter default privileges in schema public grant all on tables to service_role;

-- Belt and braces. The service role bypasses row-level security, so this
-- changes nothing for the app; it means a table that somehow did pick up a
-- grant for anon still exposes no rows without an explicit policy.
do $$
  declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
