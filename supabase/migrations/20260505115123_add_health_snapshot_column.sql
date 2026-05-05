alter table public.client_usage
  add column if not exists health_snapshot integer;