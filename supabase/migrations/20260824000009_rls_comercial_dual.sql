-- Update sales policies to use comercial_id OR csm_id (dual ownership)
-- Recreate sales policies that previously only checked csm_id

-- Clients: replace sales select to include comercial_id
DROP POLICY IF EXISTS "clients_sales_select" ON public.clients;
CREATE POLICY "clients_sales_select" ON public.clients
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'sales' AND (comercial_id = auth.uid() OR csm_id = auth.uid()));

-- Activities
DROP POLICY IF EXISTS "activities_sales_select" ON public.activities;
CREATE POLICY "activities_sales_select" ON public.activities
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'sales' AND client_id IN (SELECT id FROM public.clients WHERE comercial_id = auth.uid() OR csm_id = auth.uid()));

-- Contact links
DROP POLICY IF EXISTS "contact_links_sales_select" ON public.contact_links;
CREATE POLICY "contact_links_sales_select" ON public.contact_links
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'sales' AND client_id IN (SELECT id FROM public.clients WHERE comercial_id = auth.uid() OR csm_id = auth.uid()));

-- Client support
DROP POLICY IF EXISTS "client_support_sales_select" ON public.client_support;
CREATE POLICY "client_support_sales_select" ON public.client_support
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'sales' AND client_id IN (SELECT id FROM public.clients WHERE comercial_id = auth.uid() OR csm_id = auth.uid()));

-- Client usage
DROP POLICY IF EXISTS "client_usage_sales_select" ON public.client_usage;
CREATE POLICY "client_usage_sales_select" ON public.client_usage
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'sales' AND client_id IN (SELECT id FROM public.clients WHERE comercial_id = auth.uid() OR csm_id = auth.uid()));

-- Projects
DROP POLICY IF EXISTS "projects_sales_select" ON public.projects;
CREATE POLICY "projects_sales_select" ON public.projects
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'sales' AND client_id IN (SELECT id FROM public.clients WHERE comercial_id = auth.uid() OR csm_id = auth.uid()));

-- Onboardings
DROP POLICY IF EXISTS "onboardings_sales_select" ON public.onboardings;
CREATE POLICY "onboardings_sales_select" ON public.onboardings
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'sales' AND (csm_id = auth.uid() OR client_id IN (SELECT id FROM public.clients WHERE comercial_id = auth.uid() OR csm_id = auth.uid())));

-- Client catalog
DROP POLICY IF EXISTS "client_catalog_sales_select" ON public.client_catalog;
CREATE POLICY "client_catalog_sales_select" ON public.client_catalog
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'sales' AND client_id IN (SELECT id FROM public.clients WHERE comercial_id = auth.uid() OR csm_id = auth.uid()));

-- Module pricing
DROP POLICY IF EXISTS "module_pricing_sales_select" ON public.module_pricing;
CREATE POLICY "module_pricing_sales_select" ON public.module_pricing
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'sales' AND client_id IN (SELECT id FROM public.clients WHERE comercial_id = auth.uid() OR csm_id = auth.uid()));
