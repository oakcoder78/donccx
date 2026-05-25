-- 20260528000000 — Relatórios Operacionais (donc-reports integration)

create table if not exists client_operational_reports (
  id                   uuid        primary key default gen_random_uuid(),
  client_id            integer     references clients(id) on delete cascade,
  period               varchar(7)  not null,
  report_id            uuid        references client_reports(id) on delete set null,
  status               varchar(20) default 'pending'
                       check (status in ('pending','processing','done','error')),
  data_os              jsonb,
  data_problemas       jsonb,
  data_produtividade   jsonb,
  error_message        text,
  processed_at         timestamptz,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),
  unique (client_id, period)
);

-- updated_at automático (reuses existing public.update_updated_at_column)
create trigger trg_operational_reports_updated_at
  before update on client_operational_reports
  for each row execute function public.update_updated_at_column();

-- RLS
alter table client_operational_reports enable row level security;

create policy "operational_reports_admin_manager"
  on client_operational_reports for all
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role in ('admin','manager')
    )
  );

create policy "operational_reports_csm_own"
  on client_operational_reports for all
  using (
    exists (
      select 1 from profiles p
      join clients c on c.csm_id = p.id
      where p.id = auth.uid()
        and p.role = 'csm'
        and c.id = client_operational_reports.client_id
    )
  );

-- índices
create index idx_operational_reports_client_period
  on client_operational_reports (client_id, period);

create index idx_operational_reports_status
  on client_operational_reports (status);
