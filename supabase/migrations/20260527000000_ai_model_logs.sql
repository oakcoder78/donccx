create table if not exists public.ai_model_logs (
  id          bigint generated always as identity primary key,
  model       text not null,
  status      text not null check (status in ('success', 'fail')),
  error       text,
  latency_ms  integer,
  created_at  timestamptz default now()
);

alter table public.ai_model_logs enable row level security;

create policy "Admins can select ai_model_logs"
  on public.ai_model_logs for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Allow insert via service role (Edge Function). Authenticated users cannot insert directly.

create index if not exists idx_ai_model_logs_created_at
  on public.ai_model_logs (created_at desc);
