-- Agenda monthly-sync no primeiro dia de cada mês às 00:01 UTC via pg_cron + pg_net.
select cron.schedule(
  'monthly-sync-job',
  '1 0 1 * *',
  $$
  select net.http_post(
    url := 'https://etfeqblaeuhaobefxilp.supabase.co/functions/v1/monthly-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  )
  $$
);
