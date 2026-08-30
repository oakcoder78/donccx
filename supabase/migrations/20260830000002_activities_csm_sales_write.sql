-- Dashboard v3 (Phase 2 — Data Foundation)
-- Write access to activities for csm / sales, scoped to their own carteira.
--
-- Before this migration csm and sales have SELECT only (activities_csm_select /
-- activities_sales_select); INSERT/UPDATE/DELETE fall through to the admin/manager
-- policies and 403. The v3 "Minha agenda" block (Nova atividade / Concluir /
-- Editar) needs csm and sales to write rows for the clients they own.
--
-- finance stays read-only on activities (no write policy) — the v3 hides the
-- write CTAs for finance rather than letting them fail.
-- See docs/sdd/labs-dashboard-sdd.md §5.6 / §6 Phase 2.

-- ── csm: own carteira (csm_id = me) ──────────────────────────────────────────
DROP POLICY IF EXISTS "activities_csm_insert" ON public.activities;
CREATE POLICY "activities_csm_insert" ON public.activities
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role() = 'csm'
    AND client_id IN (SELECT id FROM public.clients WHERE csm_id = auth.uid())
  );

DROP POLICY IF EXISTS "activities_csm_update" ON public.activities;
CREATE POLICY "activities_csm_update" ON public.activities
  FOR UPDATE TO authenticated
  USING (
    public.get_user_role() = 'csm'
    AND client_id IN (SELECT id FROM public.clients WHERE csm_id = auth.uid())
  )
  WITH CHECK (
    public.get_user_role() = 'csm'
    AND client_id IN (SELECT id FROM public.clients WHERE csm_id = auth.uid())
  );

DROP POLICY IF EXISTS "activities_csm_delete" ON public.activities;
CREATE POLICY "activities_csm_delete" ON public.activities
  FOR DELETE TO authenticated
  USING (
    public.get_user_role() = 'csm'
    AND client_id IN (SELECT id FROM public.clients WHERE csm_id = auth.uid())
  );

-- ── sales: dual ownership (comercial_id = me OR csm_id = me) ──────────────────
DROP POLICY IF EXISTS "activities_sales_insert" ON public.activities;
CREATE POLICY "activities_sales_insert" ON public.activities
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role() = 'sales'
    AND client_id IN (
      SELECT id FROM public.clients
      WHERE comercial_id = auth.uid() OR csm_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "activities_sales_update" ON public.activities;
CREATE POLICY "activities_sales_update" ON public.activities
  FOR UPDATE TO authenticated
  USING (
    public.get_user_role() = 'sales'
    AND client_id IN (
      SELECT id FROM public.clients
      WHERE comercial_id = auth.uid() OR csm_id = auth.uid()
    )
  )
  WITH CHECK (
    public.get_user_role() = 'sales'
    AND client_id IN (
      SELECT id FROM public.clients
      WHERE comercial_id = auth.uid() OR csm_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "activities_sales_delete" ON public.activities;
CREATE POLICY "activities_sales_delete" ON public.activities
  FOR DELETE TO authenticated
  USING (
    public.get_user_role() = 'sales'
    AND client_id IN (
      SELECT id FROM public.clients
      WHERE comercial_id = auth.uid() OR csm_id = auth.uid()
    )
  );
