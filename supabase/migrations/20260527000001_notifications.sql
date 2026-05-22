create table if not exists public.notifications (
  id          bigint generated always as identity primary key,
  type        text not null,
  title       text not null,
  message     text,
  read        boolean default false,
  created_at  timestamptz default now()
);

alter table public.notifications enable row level security;

create policy "Admins can select notifications"
  on public.notifications for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can update notifications"
  on public.notifications for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Allow insert via service role (Edge Function). Authenticated users cannot insert directly.

create index if not exists idx_notifications_read_created
  on public.notifications (read, created_at desc);
