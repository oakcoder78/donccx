-- Phase 1 — Remove blanket RLS, add role-based policies, revoke anon grants
-- See docs/security/SECURITY_REMEDIATION_PLAN.md for the full plan

-- ============================================================================
-- 1.1 — Remove blanket "Authenticated users" policies (all rows, all ops)
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users" ON public.onboardings;
DROP POLICY IF EXISTS "Authenticated users" ON public.activities;
DROP POLICY IF EXISTS "Authenticated users" ON public.activity_attachments;
DROP POLICY IF EXISTS "Authenticated users" ON public.client_catalog;
DROP POLICY IF EXISTS "Authenticated users" ON public.client_support;
DROP POLICY IF EXISTS "Authenticated users" ON public.client_usage;
DROP POLICY IF EXISTS "Authenticated users" ON public.contact_links;
DROP POLICY IF EXISTS "Authenticated users" ON public.module_pricing;
DROP POLICY IF EXISTS "Authenticated users" ON public.onboarding_evidencias;
DROP POLICY IF EXISTS "Authenticated users" ON public.projects;
DROP POLICY IF EXISTS "Authenticated users" ON public.catalog_items;
DROP POLICY IF EXISTS "Authenticated users" ON public.health_config;
DROP POLICY IF EXISTS "Authenticated users" ON public.health_rules;
DROP POLICY IF EXISTS "Authenticated users" ON public.onboarding_activity_types;
DROP POLICY IF EXISTS "Authenticated users" ON public.onboarding_capabilities;
DROP POLICY IF EXISTS "Authenticated users" ON public.onboarding_config;
DROP POLICY IF EXISTS "Authenticated users" ON public.onboarding_fase_types;
DROP POLICY IF EXISTS "Authenticated users" ON public.contact_phones;
DROP POLICY IF EXISTS "Authenticated users" ON public.contacts;
DROP POLICY IF EXISTS "Authenticated users" ON public.segments;
DROP POLICY IF EXISTS "Authenticated users" ON public.stages;
DROP POLICY IF EXISTS "Authenticated users" ON public.project_template_activities;
DROP POLICY IF EXISTS "Authenticated users" ON public.project_template_fases;
DROP POLICY IF EXISTS "Authenticated users" ON public.project_templates;
DROP POLICY IF EXISTS "Authenticated users" ON public.onboarding_activities;
DROP POLICY IF EXISTS "Authenticated users" ON public.onboarding_fases;
DROP POLICY IF EXISTS "Authenticated users" ON public.onboarding_pendencias;

-- ============================================================================
-- 1.1 — Role-based policies
-- Role hierarchy: admin=full, manager=full, csm=own clients, analyst=read-only
-- ============================================================================

-- ── profiles (own user + admin/manager) ────────────────────────────────────

CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "profiles_read_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ── clients (has csm_id) ───────────────────────────────────────────────────

CREATE POLICY "clients_admin_all" ON public.clients
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "clients_csm_select" ON public.clients
  FOR SELECT TO authenticated
  USING (csm_id = auth.uid());

CREATE POLICY "clients_analyst_select" ON public.clients
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'role' = 'analyst');

-- ── onboardings (has csm_id + client_id) ───────────────────────────────────

CREATE POLICY "onboardings_admin_all" ON public.onboardings
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "onboardings_csm_select" ON public.onboardings
  FOR SELECT TO authenticated
  USING (
    csm_id = auth.uid()
    OR client_id IN (SELECT id FROM public.clients WHERE csm_id = auth.uid())
  );

CREATE POLICY "onboardings_analyst_select" ON public.onboardings
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'role' = 'analyst');

-- ── Tables with client_id (CSM reads rows linked to own clients) ──────────

CREATE POLICY "activities_admin_all" ON public.activities
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "activities_csm_select" ON public.activities
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE csm_id = auth.uid()));

CREATE POLICY "activities_analyst_select" ON public.activities
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'role' = 'analyst');

CREATE POLICY "activity_attachments_admin_all" ON public.activity_attachments
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "activity_attachments_csm_select" ON public.activity_attachments
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE csm_id = auth.uid()));

CREATE POLICY "activity_attachments_analyst_select" ON public.activity_attachments
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'role' = 'analyst');

CREATE POLICY "client_catalog_admin_all" ON public.client_catalog
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "client_catalog_csm_select" ON public.client_catalog
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE csm_id = auth.uid()));

CREATE POLICY "client_catalog_analyst_select" ON public.client_catalog
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'role' = 'analyst');

CREATE POLICY "client_support_admin_all" ON public.client_support
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "client_support_csm_select" ON public.client_support
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE csm_id = auth.uid()));

CREATE POLICY "client_support_analyst_select" ON public.client_support
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'role' = 'analyst');

CREATE POLICY "client_usage_admin_all" ON public.client_usage
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "client_usage_csm_select" ON public.client_usage
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE csm_id = auth.uid()));

CREATE POLICY "client_usage_analyst_select" ON public.client_usage
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'role' = 'analyst');

CREATE POLICY "contact_links_admin_all" ON public.contact_links
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "contact_links_csm_select" ON public.contact_links
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE csm_id = auth.uid()));

CREATE POLICY "contact_links_analyst_select" ON public.contact_links
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'role' = 'analyst');

CREATE POLICY "module_pricing_admin_all" ON public.module_pricing
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "module_pricing_csm_select" ON public.module_pricing
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE csm_id = auth.uid()));

CREATE POLICY "module_pricing_analyst_select" ON public.module_pricing
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'role' = 'analyst');

CREATE POLICY "onboarding_evidencias_admin_all" ON public.onboarding_evidencias
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "onboarding_evidencias_csm_select" ON public.onboarding_evidencias
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE csm_id = auth.uid()));

CREATE POLICY "onboarding_evidencias_analyst_select" ON public.onboarding_evidencias
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'role' = 'analyst');

CREATE POLICY "projects_admin_all" ON public.projects
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "projects_csm_select" ON public.projects
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE csm_id = auth.uid()));

CREATE POLICY "projects_analyst_select" ON public.projects
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'role' = 'analyst');


-- ── Reference tables (every authenticated user can read, only admin/manager writes) ─

CREATE POLICY "catalog_items_admin_all" ON public.catalog_items
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "catalog_items_read" ON public.catalog_items
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "health_config_admin_all" ON public.health_config
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "health_config_read" ON public.health_config
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "health_rules_admin_all" ON public.health_rules
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "health_rules_read" ON public.health_rules
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "onboarding_activity_types_admin_all" ON public.onboarding_activity_types
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "onboarding_activity_types_read" ON public.onboarding_activity_types
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "onboarding_capabilities_admin_all" ON public.onboarding_capabilities
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "onboarding_capabilities_read" ON public.onboarding_capabilities
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "onboarding_config_admin_all" ON public.onboarding_config
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "onboarding_config_read" ON public.onboarding_config
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "onboarding_fase_types_admin_all" ON public.onboarding_fase_types
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "onboarding_fase_types_read" ON public.onboarding_fase_types
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "contact_phones_admin_all" ON public.contact_phones
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "contact_phones_read" ON public.contact_phones
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "contacts_admin_all" ON public.contacts
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "contacts_read" ON public.contacts
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "segments_admin_all" ON public.segments
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "segments_read" ON public.segments
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "stages_admin_all" ON public.stages
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "stages_read" ON public.stages
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "project_template_activities_admin_all" ON public.project_template_activities
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "project_template_activities_read" ON public.project_template_activities
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "project_template_fases_admin_all" ON public.project_template_fases
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "project_template_fases_read" ON public.project_template_fases
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "project_templates_admin_all" ON public.project_templates
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "project_templates_read" ON public.project_templates
  FOR SELECT TO authenticated
  USING (true);

-- ── Onboarding-related tables (every authenticated user can read, only admin/manager writes) ─

CREATE POLICY "onboarding_activities_admin_all" ON public.onboarding_activities
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "onboarding_activities_read" ON public.onboarding_activities
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "onboarding_fases_admin_all" ON public.onboarding_fases
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "onboarding_fases_read" ON public.onboarding_fases
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "onboarding_pendencias_admin_all" ON public.onboarding_pendencias
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

CREATE POLICY "onboarding_pendencias_read" ON public.onboarding_pendencias
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================================
-- 1.2 — Revoke GRANT ALL TO anon from most tables
-- Keep anon access only on 4 tables:
--   access_requests   (anon inserts)
--   profiles          (INSERT for signup trigger)
--   client_reports    (SELECT for published reports)
--   report_views      (INSERT for tracking)
-- ============================================================================

REVOKE ALL ON public.activities FROM anon;
REVOKE ALL ON public.activity_attachments FROM anon;
REVOKE ALL ON public.audit_logs FROM anon;
REVOKE ALL ON public.catalog_items FROM anon;
REVOKE ALL ON public.client_catalog FROM anon;
REVOKE ALL ON public.client_catalog_history FROM anon;
REVOKE ALL ON public.client_donc_instances FROM anon;
REVOKE ALL ON public.clients FROM anon;
REVOKE ALL ON public.client_penetration FROM anon;
REVOKE ALL ON public.client_support FROM anon;
REVOKE ALL ON public.client_usage FROM anon;
REVOKE ALL ON public.contact_emails FROM anon;
REVOKE ALL ON public.contact_links FROM anon;
REVOKE ALL ON public.contact_phones FROM anon;
REVOKE ALL ON public.contacts FROM anon;
REVOKE ALL ON public.donkie_config FROM anon;
REVOKE ALL ON public.donkie_conversations FROM anon;
REVOKE ALL ON public.feature_flags FROM anon;
REVOKE ALL ON public.freshdesk_config FROM anon;
REVOKE ALL ON public.health_config FROM anon;
REVOKE ALL ON public.health_dimension_weights FROM anon;
REVOKE ALL ON public.health_rules FROM anon;
REVOKE ALL ON public.health_score_history FROM anon;
REVOKE ALL ON public.module_pricing FROM anon;
REVOKE ALL ON public.onboarding_activities FROM anon;
REVOKE ALL ON public.onboarding_activity_types FROM anon;
REVOKE ALL ON public.onboarding_capabilities FROM anon;
REVOKE ALL ON public.onboarding_config FROM anon;
REVOKE ALL ON public.onboarding_evidencias FROM anon;
REVOKE ALL ON public.onboarding_fase_types FROM anon;
REVOKE ALL ON public.onboarding_fases FROM anon;
REVOKE ALL ON public.onboarding_pendencias FROM anon;
REVOKE ALL ON public.onboardings FROM anon;
REVOKE ALL ON public.project_template_activities FROM anon;
REVOKE ALL ON public.project_template_fases FROM anon;
REVOKE ALL ON public.project_templates FROM anon;
REVOKE ALL ON public.projects FROM anon;
REVOKE ALL ON public.segments FROM anon;
REVOKE ALL ON public.stages FROM anon;
REVOKE ALL ON public.whatsapp_tickets FROM anon;

-- Also remove anon from default privileges for future tables
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
