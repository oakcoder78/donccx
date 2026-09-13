-- Extends "view everything, edit only what's yours" (already applied to clients_global_select
-- and to ClientDetail's tab visibility) to the relationship tables that back those tabs.
--
-- Until now, csm/sales could only SELECT rows for clients in their own carteira
-- (comercial_id/csm_id = auth.uid()) on these 5 tables, while finance/analyst already had
-- global SELECT. Confirmed live via RLS simulation: a sales test user on a client outside
-- their carteira got 0 rows on all of these, with no error — by design, just not the design
-- the product wants anymore. Decision: view is global for everyone; editing stays scoped
-- (admin/manager always, csm/sales only their own carteira — unchanged write policies).
--
-- client_catalog and onboardings are included too even though not named explicitly — they
-- back the same "Operacional" tab as client_usage/client_support and had the identical
-- carteira-scoped pattern; leaving them out would open the tab only halfway.

create policy "activities_global_select" on public.activities
  for select to authenticated using (true);

create policy "contact_links_global_select" on public.contact_links
  for select to authenticated using (true);

create policy "client_usage_global_select" on public.client_usage
  for select to authenticated using (true);

create policy "client_support_global_select" on public.client_support
  for select to authenticated using (true);

create policy "client_catalog_global_select" on public.client_catalog
  for select to authenticated using (true);

create policy "onboardings_global_select" on public.onboardings
  for select to authenticated using (true);

create policy "projects_global_select" on public.projects
  for select to authenticated using (true);
