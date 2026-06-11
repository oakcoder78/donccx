-- Replaces the monthly-sync cron job authentication.
-- Before: Authorization: Bearer <service_role JWT> read from the app.service_role_key
-- GUC (which was never set, so the header was empty and the job failed silently).
-- Now: dedicated webhook secret sent in x-webhook-secret, stored in Vault as
-- 'sync_webhook_secret' (inserted at deploy time, never committed to the repo).
select cron.unschedule('monthly-sync-job');

select cron.schedule(
  'monthly-sync-job',
  '1 0 1 * *',
  $$
  select net.http_post(
    url := 'https://etfeqblaeuhaobefxilp.supabase.co/functions/v1/monthly-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_webhook_secret')
    ),
    body := '{}'::jsonb
  )
  $$
);
