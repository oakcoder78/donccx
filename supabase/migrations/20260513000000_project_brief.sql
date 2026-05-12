-- ============================================================
-- 20260513000000_project_brief.sql
-- Módulo Brief de Discovery
-- Tabelas: brief_templates, brief_instances, brief_responses, brief_attachments
-- ============================================================

-- 1. TEMPLATES — catálogo de roteiros por tipo de operação
create table brief_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  operation_type text not null,
  structure jsonb not null default '{"sections":[]}',
  is_active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table brief_templates is 'Catálogo de templates de brief de discovery. structure JSONB contém seções e perguntas.';
comment on column brief_templates.operation_type is 'entrega | instalacao | assistencia | seguranca';
comment on column brief_templates.structure is 'Schema: {"sections":[{"id","order","title","deliverable","callout","audience","questions":[{"id","order","text","type","required","note","allow_attachment"}]}]}';

-- 2. INSTÂNCIAS — brief criado para um cliente dentro de uma fase
create table brief_instances (
  id uuid primary key default gen_random_uuid(),
  client_id integer not null references clients(id) on delete cascade,
  fase_id integer not null references onboarding_fases(id) on delete cascade,
  template_id uuid references brief_templates(id) on delete set null,
  title text not null,
  structure_snapshot jsonb not null,
  status text not null default 'draft' check (status in ('draft','sent','in_progress','completed','archived')),
  access_token uuid not null default gen_random_uuid() unique,
  public_expires_at timestamptz,
  sent_at timestamptz,
  completed_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table brief_instances is 'Instância de brief vinculada a uma fase de onboarding. Gerada a partir de um template.';
comment on column brief_instances.structure_snapshot is 'Cópia do template no momento da criação. Preserva o brief mesmo se o template for editado.';
comment on column brief_instances.access_token is 'Token UUID para acesso público. URL: /brief/{access_token}';

-- 3. RESPOSTAS — uma linha por pergunta respondida
create table brief_responses (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references brief_instances(id) on delete cascade,
  question_id text not null,
  response_text text,
  responded_by_email text,
  responded_by_name text,
  responded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (instance_id, question_id)
);

comment on table brief_responses is 'Respostas por pergunta. question_id referencia o id dentro do JSONB do brief_instances.structure_snapshot.';
comment on column brief_responses.responded_by_email is 'E-mail do contato do cliente que preencheu. Rastreabilidade em preenchimento colaborativo.';

-- 4. ANEXOS — arquivos vinculados a respostas ou ao brief geral
create table brief_attachments (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references brief_instances(id) on delete cascade,
  question_id text,
  file_name text not null,
  storage_path text not null,
  file_size bigint,
  mime_type text,
  uploaded_by_email text,
  uploaded_at timestamptz not null default now()
);

comment on table brief_attachments is 'Anexos do brief. question_id null = anexo geral da instância.';
comment on column brief_attachments.storage_path is 'Bucket: project-briefs. Path: {instance_id}/{filename}';

-- ============================================================
-- ÍNDICES
-- ============================================================
create index idx_brief_instances_client on brief_instances(client_id);
create index idx_brief_instances_fase on brief_instances(fase_id);
create index idx_brief_instances_token on brief_instances(access_token);
create index idx_brief_instances_status on brief_instances(status);
create index idx_brief_responses_instance on brief_responses(instance_id);
create index idx_brief_attachments_instance on brief_attachments(instance_id);

-- ============================================================
-- TRIGGERS updated_at
-- update_updated_at_column exists only in storage schema on this project;
-- create in public so triggers can reference it without schema prefix issues.
-- ============================================================
create or replace function public.update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_brief_templates_updated_at
  before update on brief_templates
  for each row execute function public.update_updated_at_column();

create trigger set_brief_instances_updated_at
  before update on brief_instances
  for each row execute function public.update_updated_at_column();

create trigger set_brief_responses_updated_at
  before update on brief_responses
  for each row execute function public.update_updated_at_column();

-- ============================================================
-- RLS
-- ============================================================
alter table brief_templates enable row level security;
alter table brief_instances enable row level security;
alter table brief_responses enable row level security;
alter table brief_attachments enable row level security;

-- Templates: qualquer Hub user lê; admin/manager cria e edita
create policy "brief_templates_select" on brief_templates
  for select to authenticated using (true);

create policy "brief_templates_insert" on brief_templates
  for insert to authenticated
  with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin','manager'))
  );

create policy "brief_templates_update" on brief_templates
  for update to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin','manager'))
  );

-- Instâncias: CSM vê clientes próprios; admin/manager vê tudo
create policy "brief_instances_select" on brief_instances
  for select to authenticated using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
      and (
        p.role in ('admin','manager')
        or exists (
          select 1 from clients c
          where c.id = brief_instances.client_id
          and c.csm_id = auth.uid()
        )
      )
    )
  );

create policy "brief_instances_insert" on brief_instances
  for insert to authenticated
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
      and (
        p.role in ('admin','manager')
        or exists (
          select 1 from clients c
          where c.id = brief_instances.client_id
          and c.csm_id = auth.uid()
        )
      )
    )
  );

create policy "brief_instances_update" on brief_instances
  for update to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
      and (
        p.role in ('admin','manager')
        or exists (
          select 1 from clients c
          where c.id = brief_instances.client_id
          and c.csm_id = auth.uid()
        )
      )
    )
  );

-- Respostas e anexos: acesso via instância → cliente
create policy "brief_responses_select" on brief_responses
  for select to authenticated using (
    exists (
      select 1 from brief_instances bi
      join clients c on c.id = bi.client_id
      join profiles p on p.id = auth.uid()
      where bi.id = brief_responses.instance_id
      and (p.role in ('admin','manager') or c.csm_id = auth.uid())
    )
  );

create policy "brief_attachments_select" on brief_attachments
  for select to authenticated using (
    exists (
      select 1 from brief_instances bi
      join clients c on c.id = bi.client_id
      join profiles p on p.id = auth.uid()
      where bi.id = brief_attachments.instance_id
      and (p.role in ('admin','manager') or c.csm_id = auth.uid())
    )
  );

-- ============================================================
-- STORAGE BUCKET
-- ============================================================
insert into storage.buckets (id, name, public)
values ('project-briefs', 'project-briefs', false)
on conflict (id) do nothing;

create policy "brief_storage_hub_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'project-briefs');

create policy "brief_storage_hub_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'project-briefs');
