-- RLS for sales and finance roles
-- Finance: sees all clients (global view, like manager but without admin features)
-- Sales: sees clients where comercial_id = auth.uid() (when column exists) OR csm_id = auth.uid() fallback
-- Note: comercial_id column will be added by labs-dashboard Phase 2 migration; policies use OR with null-safe check to avoid breakage before column exists

-- ── clients ───────────────────────────────────────────────────────────────

-- Finance: global SELECT (similar to analyst but without restriction)
DROP POLICY IF EXISTS "clients_finance_select" ON public.clients;
CREATE POLICY "clients_finance_select" ON public.clients
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'finance');

-- Sales: scoped to comercial_id or fallback csm_id
-- Uses OR with null-safe; if comercial_id column not yet present this policy will be recreated after that migration
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='comercial_id'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "clients_sales_select" ON public.clients';
    EXECUTE 'CREATE POLICY "clients_sales_select" ON public.clients FOR SELECT TO authenticated USING (public.get_user_role() = ''sales'' AND (comercial_id = auth.uid() OR csm_id = auth.uid()))';
  ELSE
    EXECUTE 'DROP POLICY IF EXISTS "clients_sales_select" ON public.clients';
    EXECUTE 'CREATE POLICY "clients_sales_select" ON public.clients FOR SELECT TO authenticated USING (public.get_user_role() = ''sales'' AND csm_id = auth.uid())';
  END IF;
END $$;

-- Activities: finance sees all? No — finance sees activities for all clients (global). Sales sees activities for own clients.
DROP POLICY IF EXISTS "activities_finance_select" ON public.activities;
CREATE POLICY "activities_finance_select" ON public.activities
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'finance');

DROP POLICY IF EXISTS "activities_sales_select" ON public.activities;
CREATE POLICY "activities_sales_select" ON public.activities
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() = 'sales'
    AND client_id IN (SELECT id FROM public.clients WHERE csm_id = auth.uid())
  );
-- TODO: when comercial_id column exists, recreate as: client_id IN (SELECT id FROM clients WHERE csm_id=auth.uid() OR comercial_id=auth.uid())

-- For simplicity and to avoid information_schema check in hot path, sales activities policy uses client ownership via clients table already filtered by client's own policy
-- Alternative simpler: allow sales to select if they can see the client (rely on join), but explicit policy needed for direct activities queries

-- Contact links, client_support, client_usage, etc. — finance gets global select like analyst; sales gets csm-scoped
DROP POLICY IF EXISTS "contact_links_finance_select" ON public.contact_links;
CREATE POLICY "contact_links_finance_select" ON public.contact_links
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'finance');

DROP POLICY IF EXISTS "contact_links_sales_select" ON public.contact_links;
CREATE POLICY "contact_links_sales_select" ON public.contact_links
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'sales' AND client_id IN (SELECT id FROM public.clients WHERE csm_id = auth.uid()));

DROP POLICY IF EXISTS "client_support_finance_select" ON public.client_support;
CREATE POLICY "client_support_finance_select" ON public.client_support
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'finance');

DROP POLICY IF EXISTS "client_support_sales_select" ON public.client_support;
CREATE POLICY "client_support_sales_select" ON public.client_support
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'sales' AND client_id IN (SELECT id FROM public.clients WHERE csm_id = auth.uid()));

DROP POLICY IF EXISTS "client_usage_finance_select" ON public.client_usage;
CREATE POLICY "client_usage_finance_select" ON public.client_usage
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'finance');

DROP POLICY IF EXISTS "client_usage_sales_select" ON public.client_usage;
CREATE POLICY "client_usage_sales_select" ON public.client_usage
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'sales' AND client_id IN (SELECT id FROM public.clients WHERE csm_id = auth.uid()));

DROP POLICY IF EXISTS "projects_finance_select" ON public.projects;
CREATE POLICY "projects_finance_select" ON public.projects
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'finance');

DROP POLICY IF EXISTS "projects_sales_select" ON public.projects;
CREATE POLICY "projects_sales_select" ON public.projects
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'sales' AND client_id IN (SELECT id FROM public.clients WHERE csm_id = auth.uid()));

-- Onboardings
DROP POLICY IF EXISTS "onboardings_finance_select" ON public.onboardings;
CREATE POLICY "onboardings_finance_select" ON public.onboardings
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'finance');

DROP POLICY IF EXISTS "onboardings_sales_select" ON public.onboardings;
CREATE POLICY "onboardings_sales_select" ON public.onboardings
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'sales' AND (csm_id = auth.uid() OR client_id IN (SELECT id FROM public.clients WHERE csm_id = auth.uid())));

-- Client catalog, module_pricing, onboarding related — finance global, sales scoped
DROP POLICY IF EXISTS "client_catalog_finance_select" ON public.client_catalog;
CREATE POLICY "client_catalog_finance_select" ON public.client_catalog
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'finance');

DROP POLICY IF EXISTS "client_catalog_sales_select" ON public.client_catalog;
CREATE POLICY "client_catalog_sales_select" ON public.client_catalog
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'sales' AND client_id IN (SELECT id FROM public.clients WHERE csm_id = auth.uid()));

DROP POLICY IF EXISTS "module_pricing_finance_select" ON public.module_pricing;
CREATE POLICY "module_pricing_finance_select" ON public.module_pricing
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'finance');

DROP POLICY IF EXISTS "module_pricing_sales_select" ON public.module_pricing;
CREATE POLICY "module_pricing_sales_select" ON public.module_pricing
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'sales' AND client_id IN (SELECT id FROM public.clients WHERE csm_id = auth.uid()));

-- Profiles: finance/sales can read own + admin/manager already covers
-- (profiles_read_own already allows self; no extra policy needed)

-- Indexes for performance (finance global scan, sales scoped)
CREATE INDEX IF NOT EXISTS idx_clients_csm_id ON public.clients(csm_id);
CREATE INDEX IF NOT EXISTS idx_clients_lifecycle_stage ON public.clients(lifecycle_stage);
