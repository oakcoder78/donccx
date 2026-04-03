-- =============================================================
-- 002_fix_rls.sql
-- Fix RLS policies — use "to authenticated using (true)"
-- Rodar no Supabase SQL Editor
-- =============================================================

-- profiles
drop policy if exists "Authenticated users" on profiles;
create policy "Authenticated users" on profiles
  for all to authenticated
  using (true)
  with check (true);

-- clients
drop policy if exists "Authenticated users" on clients;
create policy "Authenticated users" on clients
  for all to authenticated
  using (true)
  with check (true);

-- contacts
drop policy if exists "Authenticated users" on contacts;
create policy "Authenticated users" on contacts
  for all to authenticated
  using (true)
  with check (true);

-- contact_phones
drop policy if exists "Authenticated users" on contact_phones;
create policy "Authenticated users" on contact_phones
  for all to authenticated
  using (true)
  with check (true);

-- contact_links
drop policy if exists "Authenticated users" on contact_links;
create policy "Authenticated users" on contact_links
  for all to authenticated
  using (true)
  with check (true);

-- activities
drop policy if exists "Authenticated users" on activities;
create policy "Authenticated users" on activities
  for all to authenticated
  using (true)
  with check (true);

-- activity_attachments
drop policy if exists "Authenticated users" on activity_attachments;
create policy "Authenticated users" on activity_attachments
  for all to authenticated
  using (true)
  with check (true);

-- milestones
drop policy if exists "Authenticated users" on milestones;
create policy "Authenticated users" on milestones
  for all to authenticated
  using (true)
  with check (true);

-- milestone_tasks
drop policy if exists "Authenticated users" on milestone_tasks;
create policy "Authenticated users" on milestone_tasks
  for all to authenticated
  using (true)
  with check (true);

-- client_catalog
drop policy if exists "Authenticated users" on client_catalog;
create policy "Authenticated users" on client_catalog
  for all to authenticated
  using (true)
  with check (true);

-- client_usage
drop policy if exists "Authenticated users" on client_usage;
create policy "Authenticated users" on client_usage
  for all to authenticated
  using (true)
  with check (true);

-- client_support
drop policy if exists "Authenticated users" on client_support;
create policy "Authenticated users" on client_support
  for all to authenticated
  using (true)
  with check (true);

-- onboarding_phases
drop policy if exists "Authenticated users" on onboarding_phases;
create policy "Authenticated users" on onboarding_phases
  for all to authenticated
  using (true)
  with check (true);

-- onboarding_tasks
drop policy if exists "Authenticated users" on onboarding_tasks;
create policy "Authenticated users" on onboarding_tasks
  for all to authenticated
  using (true)
  with check (true);

-- stages
drop policy if exists "Authenticated users" on stages;
create policy "Authenticated users" on stages
  for all to authenticated
  using (true)
  with check (true);

-- catalog_items
drop policy if exists "Authenticated users" on catalog_items;
create policy "Authenticated users" on catalog_items
  for all to authenticated
  using (true)
  with check (true);

-- health_config
drop policy if exists "Authenticated users" on health_config;
create policy "Authenticated users" on health_config
  for all to authenticated
  using (true)
  with check (true);

-- health_rules
drop policy if exists "Authenticated users" on health_rules;
create policy "Authenticated users" on health_rules
  for all to authenticated
  using (true)
  with check (true);
