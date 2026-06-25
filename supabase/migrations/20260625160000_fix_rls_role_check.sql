-- Fix RLS policies: replace auth.jwt() ->> 'role' with get_user_role() function
-- See docs/security/SECURITY_REMEDIATION_PLAN.md
--
-- Root cause: auth.jwt() ->> 'role' returns the Supabase JWT role claim,
-- which is always 'authenticated' for logged-in users. The app's custom
-- role (admin/manager/csm/analyst) lives in profiles.role, not in the JWT.
--
-- Fix: create a SECURITY DEFINER helper that reads profiles.role bypassing RLS,
-- then use it in all role-based policies.

-- ============================================================================
-- Helper function: get_user_role()
-- SECURITY DEFINER runs as owner (bypasses RLS), prevents recursion in
-- policies on the profiles table itself.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- ============================================================================
-- Fix all policies that incorrectly used auth.jwt() ->> 'role'
-- ============================================================================

-- ── profiles ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

-- ── clients ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "clients_admin_all" ON public.clients;
CREATE POLICY "clients_admin_all" ON public.clients
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

DROP POLICY IF EXISTS "clients_analyst_select" ON public.clients;
CREATE POLICY "clients_analyst_select" ON public.clients
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'analyst');

-- ── onboardings ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "onboardings_admin_all" ON public.onboardings;
CREATE POLICY "onboardings_admin_all" ON public.onboardings
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

DROP POLICY IF EXISTS "onboardings_analyst_select" ON public.onboardings;
CREATE POLICY "onboardings_analyst_select" ON public.onboardings
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'analyst');

-- ── activities ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "activities_admin_all" ON public.activities;
CREATE POLICY "activities_admin_all" ON public.activities
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

DROP POLICY IF EXISTS "activities_analyst_select" ON public.activities;
CREATE POLICY "activities_analyst_select" ON public.activities
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'analyst');

-- ── activity_attachments ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "activity_attachments_admin_all" ON public.activity_attachments;
CREATE POLICY "activity_attachments_admin_all" ON public.activity_attachments
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

DROP POLICY IF EXISTS "activity_attachments_analyst_select" ON public.activity_attachments;
CREATE POLICY "activity_attachments_analyst_select" ON public.activity_attachments
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'analyst');

-- ── client_catalog ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "client_catalog_admin_all" ON public.client_catalog;
CREATE POLICY "client_catalog_admin_all" ON public.client_catalog
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

DROP POLICY IF EXISTS "client_catalog_analyst_select" ON public.client_catalog;
CREATE POLICY "client_catalog_analyst_select" ON public.client_catalog
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'analyst');

-- ── client_support ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "client_support_admin_all" ON public.client_support;
CREATE POLICY "client_support_admin_all" ON public.client_support
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

DROP POLICY IF EXISTS "client_support_analyst_select" ON public.client_support;
CREATE POLICY "client_support_analyst_select" ON public.client_support
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'analyst');

-- ── client_usage ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "client_usage_admin_all" ON public.client_usage;
CREATE POLICY "client_usage_admin_all" ON public.client_usage
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

DROP POLICY IF EXISTS "client_usage_analyst_select" ON public.client_usage;
CREATE POLICY "client_usage_analyst_select" ON public.client_usage
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'analyst');

-- ── contact_links ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "contact_links_admin_all" ON public.contact_links;
CREATE POLICY "contact_links_admin_all" ON public.contact_links
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

DROP POLICY IF EXISTS "contact_links_analyst_select" ON public.contact_links;
CREATE POLICY "contact_links_analyst_select" ON public.contact_links
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'analyst');

-- ── module_pricing ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "module_pricing_admin_all" ON public.module_pricing;
CREATE POLICY "module_pricing_admin_all" ON public.module_pricing
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

DROP POLICY IF EXISTS "module_pricing_analyst_select" ON public.module_pricing;
CREATE POLICY "module_pricing_analyst_select" ON public.module_pricing
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'analyst');

-- ── onboarding_evidencias ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "onboarding_evidencias_admin_all" ON public.onboarding_evidencias;
CREATE POLICY "onboarding_evidencias_admin_all" ON public.onboarding_evidencias
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

DROP POLICY IF EXISTS "onboarding_evidencias_analyst_select" ON public.onboarding_evidencias;
CREATE POLICY "onboarding_evidencias_analyst_select" ON public.onboarding_evidencias
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'analyst');

-- ── projects ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "projects_admin_all" ON public.projects;
CREATE POLICY "projects_admin_all" ON public.projects
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

DROP POLICY IF EXISTS "projects_analyst_select" ON public.projects;
CREATE POLICY "projects_analyst_select" ON public.projects
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'analyst');

-- ── catalog_items (reference) ──────────────────────────────────────────────

DROP POLICY IF EXISTS "catalog_items_admin_all" ON public.catalog_items;
CREATE POLICY "catalog_items_admin_all" ON public.catalog_items
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

-- ── health_config (reference) ──────────────────────────────────────────────

DROP POLICY IF EXISTS "health_config_admin_all" ON public.health_config;
CREATE POLICY "health_config_admin_all" ON public.health_config
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

-- ── health_rules (reference) ────────────────────────────────────────────────

DROP POLICY IF EXISTS "health_rules_admin_all" ON public.health_rules;
CREATE POLICY "health_rules_admin_all" ON public.health_rules
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

-- ── onboarding_activity_types (reference) ──────────────────────────────────

DROP POLICY IF EXISTS "onboarding_activity_types_admin_all" ON public.onboarding_activity_types;
CREATE POLICY "onboarding_activity_types_admin_all" ON public.onboarding_activity_types
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

-- ── onboarding_capabilities (reference) ────────────────────────────────────

DROP POLICY IF EXISTS "onboarding_capabilities_admin_all" ON public.onboarding_capabilities;
CREATE POLICY "onboarding_capabilities_admin_all" ON public.onboarding_capabilities
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

-- ── onboarding_config (reference) ──────────────────────────────────────────

DROP POLICY IF EXISTS "onboarding_config_admin_all" ON public.onboarding_config;
CREATE POLICY "onboarding_config_admin_all" ON public.onboarding_config
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

-- ── onboarding_fase_types (reference) ──────────────────────────────────────

DROP POLICY IF EXISTS "onboarding_fase_types_admin_all" ON public.onboarding_fase_types;
CREATE POLICY "onboarding_fase_types_admin_all" ON public.onboarding_fase_types
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

-- ── contact_phones (reference) ─────────────────────────────────────────────

DROP POLICY IF EXISTS "contact_phones_admin_all" ON public.contact_phones;
CREATE POLICY "contact_phones_admin_all" ON public.contact_phones
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

-- ── contacts (reference) ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "contacts_admin_all" ON public.contacts;
CREATE POLICY "contacts_admin_all" ON public.contacts
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

-- ── segments (reference) ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "segments_admin_all" ON public.segments;
CREATE POLICY "segments_admin_all" ON public.segments
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

-- ── stages (reference) ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "stages_admin_all" ON public.stages;
CREATE POLICY "stages_admin_all" ON public.stages
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

-- ── project_template_activities (reference) ────────────────────────────────

DROP POLICY IF EXISTS "project_template_activities_admin_all" ON public.project_template_activities;
CREATE POLICY "project_template_activities_admin_all" ON public.project_template_activities
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

-- ── project_template_fases (reference) ─────────────────────────────────────

DROP POLICY IF EXISTS "project_template_fases_admin_all" ON public.project_template_fases;
CREATE POLICY "project_template_fases_admin_all" ON public.project_template_fases
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

-- ── project_templates (reference) ──────────────────────────────────────────

DROP POLICY IF EXISTS "project_templates_admin_all" ON public.project_templates;
CREATE POLICY "project_templates_admin_all" ON public.project_templates
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

-- ── onboarding_activities ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "onboarding_activities_admin_all" ON public.onboarding_activities;
CREATE POLICY "onboarding_activities_admin_all" ON public.onboarding_activities
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

-- ── onboarding_fases ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "onboarding_fases_admin_all" ON public.onboarding_fases;
CREATE POLICY "onboarding_fases_admin_all" ON public.onboarding_fases
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

-- ── onboarding_pendencias ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "onboarding_pendencias_admin_all" ON public.onboarding_pendencias;
CREATE POLICY "onboarding_pendencias_admin_all" ON public.onboarding_pendencias
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));
