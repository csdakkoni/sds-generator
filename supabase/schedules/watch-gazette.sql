-- Daily call of the watch-gazette Edge Function (06:30 Istanbul = 03:30 UTC).
-- Not a migration: plain Postgres in CI has no pg_cron / pg_net. Run once in the Supabase SQL editor.
-- The key below is the project's public anon key (safe to store); the function does the real checks.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('watch-gazette') where exists (select 1 from cron.job where jobname = 'watch-gazette');

select cron.schedule(
  'watch-gazette',
  '30 3 * * *',
  $$
  select net.http_post(
    url := 'https://nsxicgzidapirnxesqxk.supabase.co/functions/v1/watch-gazette',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zeGljZ3ppZGFwaXJueGVzcXhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNTIyMDksImV4cCI6MjEwNzkyODIwOX0.sT0jlsOfCquxg2_qOIirm_BVBFjywIzauo0nhfwb86w'
    ),
    body := '{}'::jsonb
  );
  $$
);
