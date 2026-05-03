-- ============================================================
-- doncCX v1 — Initial Schema
-- Run this in the Supabase SQL Editor
-- ============================================================

create table if not exists profiles (
  id uuid references auth.users primary key,
  name text not null,
  email text not null,
  role text check (role in ('admin','manager','csm')) default 'csm',
  csm_id integer unique,
  status text check (status in ('active','pending','blocked')) default 'active',
  created_at timestamptz default now()
);

create table if not exists stages (
  id serial primary key,
  name text not null,
  color text default '#59c2ed',
  description text,
  display_order integer default 0
);

create table if not exists catalog_items (
  id serial primary key,
  type text check (type in ('servico','solucao')) not null,
  name text not null,
  color text default '#173557'
);

create table if not exists clients (
  id serial primary key,
  name text not null,
  cnpj text,
  segment text,
  csm_id uuid references profiles(id),
  stage_id integer references stages(id),
  stage_override boolean default false,
  abc_class text check (abc_class in ('A','B','C')),
  mrr numeric default 0,
  licencas integer default 0,
  valor_lic numeric default 0,
  contract_start date,
  contract_renewal date,
  delay_days integer default 0,
  app_code text,
  url_donc text,
  onb_start date,
  golive date,
  health_uso integer default 0,
  health_suporte integer default 0,
  health_relacionamento integer default 0,
  health_financeiro integer default 0,
  health_projeto integer default 0,
  health_total integer generated always as
    (health_uso + health_suporte + health_relacionamento +
     health_financeiro + health_projeto) stored,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists client_catalog (
  client_id integer references clients(id) on delete cascade,
  catalog_item_id integer references catalog_items(id),
  primary key (client_id, catalog_item_id)
);

create table if not exists contacts (
  id serial primary key,
  name text not null,
  cargo text,
  email text,
  linkedin text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists contact_phones (
  id serial primary key,
  contact_id integer references contacts(id) on delete cascade,
  number text not null,
  type text check (type in ('WhatsApp','Celular','Fixo')) default 'Celular'
);

create table if not exists contact_links (
  id serial primary key,
  contact_id integer references contacts(id) on delete cascade,
  client_id integer references clients(id) on delete cascade,
  papel text check (papel in ('Decisor','Influenciador','Usuário')) default 'Usuário',
  engajamento text check (engajamento in ('Alto','Médio','Baixo')) default 'Médio',
  champion boolean default false,
  unique(contact_id, client_id)
);

create table if not exists activities (
  id serial primary key,
  type text check (type in ('reuniao','ligacao','email','whatsapp','tarefa','nota')) not null,
  title text,
  description text not null,
  client_id integer references clients(id) on delete cascade,
  contact_id integer references contacts(id),
  responsible_id uuid references profiles(id),
  activity_date date not null,
  activity_time time,
  status text check (status in ('pendente','concluida')) default 'pendente',
  due_date date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists activity_attachments (
  id serial primary key,
  activity_id integer references activities(id) on delete cascade,
  file_name text not null,
  file_size integer,
  file_url text,
  created_at timestamptz default now()
);

create table if not exists milestones (
  id serial primary key,
  client_id integer references clients(id) on delete cascade,
  title text not null,
  due_date date,
  status text check (status in ('planejado','em_andamento','done')) default 'planejado',
  progress integer default 0,
  created_at timestamptz default now()
);

create table if not exists milestone_tasks (
  id serial primary key,
  milestone_id integer references milestones(id) on delete cascade,
  title text not null,
  done boolean default false,
  display_order integer default 0
);

create table if not exists client_usage (
  id serial primary key,
  client_id integer references clients(id) on delete cascade,
  ref_month text not null,
  os_created integer default 0,
  active_users integer default 0,
  unique(client_id, ref_month)
);

create table if not exists client_support (
  id serial primary key,
  client_id integer references clients(id) on delete cascade,
  ref_month text not null,
  tickets_opened integer default 0,
  tickets_resolved integer default 0,
  sla_first_response integer default 0,
  n1_pct integer default 0,
  n2_pct integer default 0,
  n3_pct integer default 0,
  unique(client_id, ref_month)
);

create table if not exists onboarding_phases (
  id serial primary key,
  client_id integer references clients(id) on delete cascade,
  name text not null,
  status text check (status in ('done','in_progress','pending')) default 'pending',
  start_date text,
  end_date text,
  is_parallel boolean default false,
  display_order integer default 0
);

create table if not exists onboarding_tasks (
  id serial primary key,
  phase_id integer references onboarding_phases(id) on delete cascade,
  title text not null,
  done boolean default false
);

create table if not exists health_config (
  id serial primary key,
  threshold_healthy integer default 75,
  threshold_attention integer default 50
);

create table if not exists health_rules (
  id serial primary key,
  dimension text not null,
  label text not null,
  rule_key text not null,
  points integer default 0
);

-- ============================================================
-- Enable RLS
-- ============================================================
alter table profiles enable row level security;
alter table clients enable row level security;
alter table contacts enable row level security;
alter table activities enable row level security;
alter table milestones enable row level security;
alter table milestone_tasks enable row level security;
alter table contact_links enable row level security;
alter table contact_phones enable row level security;
alter table client_catalog enable row level security;
alter table client_usage enable row level security;
alter table client_support enable row level security;
alter table onboarding_phases enable row level security;
alter table onboarding_tasks enable row level security;
alter table activity_attachments enable row level security;
alter table stages enable row level security;
alter table catalog_items enable row level security;
alter table health_config enable row level security;
alter table health_rules enable row level security;

-- ============================================================
-- Policies: authenticated users see/edit everything (v1)
-- ============================================================
do $$ begin
  create policy "Authenticated users" on profiles for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Authenticated users" on clients for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Authenticated users" on contacts for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Authenticated users" on activities for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Authenticated users" on milestones for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Authenticated users" on milestone_tasks for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Authenticated users" on contact_links for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Authenticated users" on contact_phones for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Authenticated users" on client_catalog for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Authenticated users" on client_usage for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Authenticated users" on client_support for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Authenticated users" on onboarding_phases for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Authenticated users" on onboarding_tasks for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Authenticated users" on activity_attachments for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Authenticated users" on stages for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Authenticated users" on catalog_items for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Authenticated users" on health_config for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Authenticated users" on health_rules for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- ============================================================
-- Trigger: auto-create profile on auth.users insert
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'csm'),
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Seed data
-- ============================================================
insert into stages (name, color, display_order) values
  ('Onboarding', '#59c2ed', 1),
  ('Estabilização', '#BA7517', 2),
  ('Produção', '#1D9E75', 3),
  ('Expansão', '#534AB7', 4),
  ('Churned', '#E24B4A', 5)
on conflict do nothing;

insert into catalog_items (type, name, color) values
  ('servico', 'Assistência', '#1D9E75'),
  ('servico', 'Entrega', '#59c2ed'),
  ('servico', 'Montagem', '#534AB7'),
  ('servico', 'Coleta', '#BA7517'),
  ('servico', 'Instalação', '#D85A30'),
  ('solucao', 'Agenda', '#173557'),
  ('solucao', 'Assistência', '#1D9E75'),
  ('solucao', 'Comunicação', '#59c2ed'),
  ('solucao', 'Controle de Estoque', '#BA7517'),
  ('solucao', 'Fluxo Perfeito', '#534AB7'),
  ('solucao', 'Métricas', '#888780'),
  ('solucao', 'Operacional', '#173557'),
  ('solucao', 'Rem. Variável', '#D85A30'),
  ('solucao', 'Roteirizador Int.', '#1D9E75'),
  ('solucao', 'Roteirizador Manual', '#185FA5')
on conflict do nothing;

insert into health_config (threshold_healthy, threshold_attention) values (75, 50)
on conflict do nothing;

insert into health_rules (dimension, label, rule_key, points) values
  ('uso', 'Módulos 4+', 'm4', 5),
  ('uso', 'Módulos 2-3', 'm23', 3),
  ('uso', 'Usuários +10%', 'u10', 5),
  ('uso', 'Usuários -10%', 'ud10', -5),
  ('suporte', 'Tickets 0', 't0', 5),
  ('suporte', 'Tickets >15', 't15', -5),
  ('suporte', 'Resolução 90%+', 'r90', 5),
  ('relacionamento', 'Decisor mapeado', 'dec', 5),
  ('relacionamento', 'Champion', 'champ', 3),
  ('relacionamento', 'Engajamento alto', 'ea', 5),
  ('financeiro', 'ABC A', 'aa', 15),
  ('financeiro', 'ABC B', 'ab', 10),
  ('financeiro', 'Sem atraso', 'at0', 10),
  ('projeto', 'Milestones no prazo', 'mp', 10),
  ('projeto', 'Onboarding ok', 'ob', 5)
on conflict do nothing;
