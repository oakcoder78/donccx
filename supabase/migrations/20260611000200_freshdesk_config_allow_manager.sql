-- freshdesk_config write policies allowed only 'admin', but the freshdesk-proxy
-- read path and the sync functions already treat 'manager' as authorized. A manager
-- could fetch the Freshdesk config but not persist it. Align INSERT/UPDATE to admin OR manager.
drop policy if exists freshdesk_config_insert on public.freshdesk_config;
drop policy if exists freshdesk_config_update on public.freshdesk_config;

create policy freshdesk_config_insert on public.freshdesk_config
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role in ('admin', 'manager')
    )
  );

create policy freshdesk_config_update on public.freshdesk_config
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role in ('admin', 'manager')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role in ('admin', 'manager')
    )
  );
