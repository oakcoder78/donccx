create table if not exists public.health_score_history (
  id bigint generated always as identity primary key,
  client_id integer not null references public.clients(id) on delete cascade,
  ref_month text not null,
  health_uso integer not null default 0,
  health_suporte integer not null default 0,
  health_relacionamento integer not null default 0,
  health_financeiro integer not null default 0,
  health_projeto integer not null default 0,
  health_total integer not null default 0,
  recorded_at timestamptz not null default now()
);

create unique index if not exists health_score_history_client_month
  on public.health_score_history(client_id, ref_month);

alter table public.health_score_history enable row level security;

create policy "authenticated read history"
  on public.health_score_history for select
  to authenticated using (true);

create policy "authenticated write history"
  on public.health_score_history for all
  to authenticated using (true);
