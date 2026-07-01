-- Cria tabela sync_log para rastrear execuções da Edge Function monthly-sync.
-- A Edge Function insere um registro no início (running) e atualiza ao final
-- com success/failed + summary. O frontend consulta esta tabela para exibir
-- o status da última sincronização automática.

create table public.sync_log (
  id            bigint generated always as identity primary key,
  job_name      text not null default 'monthly-sync',
  status        text not null check (status in ('running', 'success', 'failed')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  summary       jsonb,
  error_message text
);

create index idx_sync_log_job_started on public.sync_log (job_name, started_at desc);

-- RLS: permite leitura para usuários autenticados, escrita apenas via service_role
alter table public.sync_log enable row level security;

create policy "sync_log_select_authenticated"
  on public.sync_log for select
  to authenticated
  using (true);

create policy "sync_log_insert_service_role"
  on public.sync_log for insert
  to service_role
  with check (true);

create policy "sync_log_update_service_role"
  on public.sync_log for update
  to service_role
  using (true);
