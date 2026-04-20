-- Tabela de pesos por grupo de estágio
create table if not exists public.health_dimension_weights (
  id bigint generated always as identity primary key,
  stage_group text not null,
  dimension text not null,
  weight integer not null default 20,
  constraint health_dimension_weights_stage_dim unique (stage_group, dimension)
);

alter table public.health_dimension_weights enable row level security;
create policy "authenticated all weights" on public.health_dimension_weights
  for all to authenticated using (true);

-- Seed dos três grupos com os pesos definidos
insert into public.health_dimension_weights (stage_group, dimension, weight) values
  ('onboarding',           'uso',            15),
  ('onboarding',           'relacionamento', 20),
  ('onboarding',           'projeto',        35),
  ('onboarding',           'suporte',        15),
  ('onboarding',           'financeiro',     10),
  ('onboarding',           'temperatura',     5),
  ('producao',             'uso',            30),
  ('producao',             'relacionamento', 20),
  ('producao',             'projeto',        20),
  ('producao',             'suporte',        15),
  ('producao',             'financeiro',     10),
  ('producao',             'temperatura',     5),
  ('producao_sem_projeto', 'uso',            35),
  ('producao_sem_projeto', 'relacionamento', 25),
  ('producao_sem_projeto', 'projeto',         0),
  ('producao_sem_projeto', 'suporte',        20),
  ('producao_sem_projeto', 'financeiro',     15),
  ('producao_sem_projeto', 'temperatura',     5)
on conflict (stage_group, dimension) do nothing;

-- Temperatura do CSM em clients
alter table public.clients
  add column if not exists csm_temperature integer default 0,
  add column if not exists temperature_updated_at timestamptz,
  add column if not exists temperature_note text;
