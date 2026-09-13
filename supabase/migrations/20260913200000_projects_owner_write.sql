-- "View everything, edit only what's yours" applied to projects (Salesforce/HubSpot-style model,
-- same pattern already shipped for public.clients this session): csm/sales could already SELECT
-- projects of their own carteira (projects_csm_select / projects_sales_select), but had no write
-- policy at all — only admin/manager (projects_admin_all) could update status or delete. A csm/sales
-- user updating their own project's status silently affected 0 rows.
--
-- Mirrors the ownership scoping already established for SELECT: csm via clients.csm_id, sales via
-- the dual comercial_id/csm_id carteira (20260824000009_rls_comercial_dual.sql).

create policy "projects_csm_update" on public.projects
  for update to authenticated
  using (client_id in (select id from public.clients where csm_id = auth.uid()))
  with check (client_id in (select id from public.clients where csm_id = auth.uid()));

create policy "projects_csm_delete" on public.projects
  for delete to authenticated
  using (client_id in (select id from public.clients where csm_id = auth.uid()));

create policy "projects_sales_update" on public.projects
  for update to authenticated
  using (client_id in (select id from public.clients where comercial_id = auth.uid() or csm_id = auth.uid()))
  with check (client_id in (select id from public.clients where comercial_id = auth.uid() or csm_id = auth.uid()));

create policy "projects_sales_delete" on public.projects
  for delete to authenticated
  using (client_id in (select id from public.clients where comercial_id = auth.uid() or csm_id = auth.uid()));
