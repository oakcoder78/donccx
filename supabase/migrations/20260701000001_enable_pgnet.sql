-- Habilita pg_net para que o pg_cron possa chamar Edge Functions via net.http_post().
-- pg_cron já está habilitado; sem pg_net o cron falha silenciosamente.

create extension if not exists pg_net with schema extensions;

-- Garante que o schema extensions é acessível pelo postgres
grant usage on schema extensions to postgres, service_role, anon;
