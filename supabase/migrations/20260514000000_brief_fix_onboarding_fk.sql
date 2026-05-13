-- ============================================================
-- 20260514000000_brief_fix_onboarding_fk.sql
-- Corrige FK de brief_instances: fase_id -> onboarding_id
-- ============================================================

-- 1. Adiciona coluna onboarding_id como nullable primeiro
alter table brief_instances
  add column onboarding_id integer;

-- 2. Atualiza registros existentes: deriva onboarding_id via cliente (pega o onboarding ativo mais recente)
update brief_instances bi
set onboarding_id = (
  select o.id
  from onboardings o
  where o.client_id = bi.client_id
  and o.status = 'ativo'
  order by o.created_at desc
  limit 1
)
where bi.onboarding_id is null;

-- 3. Remove índice e FK antigos
drop index if exists idx_brief_instances_fase;
alter table brief_instances drop constraint if exists brief_instances_fase_id_fkey;

-- 4. Remove coluna fase_id
alter table brief_instances drop column if exists fase_id;

-- 5. Adiciona FK e constraint NOT NULL
alter table brief_instances
  add constraint brief_instances_onboarding_id_fkey foreign key (onboarding_id) references onboardings(id) on delete cascade;

alter table brief_instances alter column onboarding_id set not null;

-- 6. Novo índice
create index idx_brief_instances_onboarding on brief_instances(onboarding_id);

-- 7. Atualiza comment
comment on column brief_instances.onboarding_id is 'Onboarding ao qual o brief pertence. Um onboarding tem no máximo um brief ativo.';
comment on table brief_instances is 'Instância de brief vinculada a um onboarding. Gerada a partir de um template.';