create table if not exists brief_views (
  id          uuid primary key default gen_random_uuid(),
  instance_id uuid not null references brief_instances(id) on delete cascade,
  email       text not null,
  viewed_at   timestamptz not null default now()
);

create index idx_brief_views_instance on brief_views(instance_id);

alter table brief_views enable row level security;

create policy "brief_views_select_authenticated" on brief_views
  for select using (auth.role() = 'authenticated');

create policy "brief_views_insert_service" on brief_views
  for insert with check (true);
