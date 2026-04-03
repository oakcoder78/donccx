-- =============================================================
-- Fix RLS Policies — trocar auth.role() por auth.uid() IS NOT NULL
-- Rodar no Supabase SQL Editor
-- =============================================================

-- profiles
drop policy if exists "Authenticated users" on profiles;
create policy "Authenticated users" on profiles
  for all using (auth.uid() is not null);

-- stages
drop policy if exists "Authenticated users" on stages;
create policy "Authenticated users" on stages
  for all using (auth.uid() is not null);

-- clients
drop policy if exists "Authenticated users" on clients;
create policy "Authenticated users" on clients
  for all using (auth.uid() is not null);

-- client_catalog
drop policy if exists "Authenticated users" on client_catalog;
create policy "Authenticated users" on client_catalog
  for all using (auth.uid() is not null);

-- client_usage
drop policy if exists "Authenticated users" on client_usage;
create policy "Authenticated users" on client_usage
  for all using (auth.uid() is not null);

-- client_support
drop policy if exists "Authenticated users" on client_support;
create policy "Authenticated users" on client_support
  for all using (auth.uid() is not null);

-- contacts
drop policy if exists "Authenticated users" on contacts;
create policy "Authenticated users" on contacts
  for all using (auth.uid() is not null);

-- contact_phones
drop policy if exists "Authenticated users" on contact_phones;
create policy "Authenticated users" on contact_phones
  for all using (auth.uid() is not null);

-- contact_links
drop policy if exists "Authenticated users" on contact_links;
create policy "Authenticated users" on contact_links
  for all using (auth.uid() is not null);

-- activities
drop policy if exists "Authenticated users" on activities;
create policy "Authenticated users" on activities
  for all using (auth.uid() is not null);

-- activity_attachments
drop policy if exists "Authenticated users" on activity_attachments;
create policy "Authenticated users" on activity_attachments
  for all using (auth.uid() is not null);

-- milestones
drop policy if exists "Authenticated users" on milestones;
create policy "Authenticated users" on milestones
  for all using (auth.uid() is not null);

-- milestone_tasks
drop policy if exists "Authenticated users" on milestone_tasks;
create policy "Authenticated users" on milestone_tasks
  for all using (auth.uid() is not null);

-- onboarding_phases
drop policy if exists "Authenticated users" on onboarding_phases;
create policy "Authenticated users" on onboarding_phases
  for all using (auth.uid() is not null);

-- onboarding_tasks
drop policy if exists "Authenticated users" on onboarding_tasks;
create policy "Authenticated users" on onboarding_tasks
  for all using (auth.uid() is not null);

-- catalog_items
drop policy if exists "Authenticated users" on catalog_items;
create policy "Authenticated users" on catalog_items
  for all using (auth.uid() is not null);

-- health_config
drop policy if exists "Authenticated users" on health_config;
create policy "Authenticated users" on health_config
  for all using (auth.uid() is not null);

-- health_rules
drop policy if exists "Authenticated users" on health_rules;
create policy "Authenticated users" on health_rules
  for all using (auth.uid() is not null);
