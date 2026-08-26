-- Allow finance to view (already SELECT) and edit empresas (4 tabs)
-- Finance needs UPDATE on clients (main table for all 4 tabs) plus related tables

-- Clients: allow finance to UPDATE (and INSERT for completeness)
DROP POLICY IF EXISTS "clients_finance_update" ON public.clients;
CREATE POLICY "clients_finance_update" ON public.clients
  FOR UPDATE TO authenticated
  USING (public.get_user_role() = 'finance')
  WITH CHECK (public.get_user_role() = 'finance');

DROP POLICY IF EXISTS "clients_finance_insert" ON public.clients;
CREATE POLICY "clients_finance_insert" ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() = 'finance');

-- Related tables that may be touched via empresa edit or detail view
-- client_catalog (catalog items linked to client)
DROP POLICY IF EXISTS "client_catalog_finance_modify" ON public.client_catalog;
CREATE POLICY "client_catalog_finance_modify" ON public.client_catalog
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'finance')
  WITH CHECK (public.get_user_role() = 'finance');

-- module_pricing
DROP POLICY IF EXISTS "module_pricing_finance_modify" ON public.module_pricing;
CREATE POLICY "module_pricing_finance_modify" ON public.module_pricing
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'finance')
  WITH CHECK (public.get_user_role() = 'finance');

-- Ensure SELECT still covered for completeness (already exists but keep)
-- Add missing SELECT for finance on tables that ClientDetail may need
DROP POLICY IF EXISTS "contacts_finance_select" ON public.contacts;
CREATE POLICY "contacts_finance_select" ON public.contacts
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'finance');

DROP POLICY IF EXISTS "contact_phones_finance_select" ON public.contact_phones;
CREATE POLICY "contact_phones_finance_select" ON public.contact_phones
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'finance');

DROP POLICY IF EXISTS "activity_attachments_finance_select" ON public.activity_attachments;
CREATE POLICY "activity_attachments_finance_select" ON public.activity_attachments
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'finance');

-- Allow finance to view health config/rules (already global read, but ensure)
-- No change needed; health_config_read is true for all authenticated
