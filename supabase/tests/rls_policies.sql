-- RLS Policy Test Suite
-- Run via: psql $DATABASE_URL -f supabase/tests/rls_policies.sql
-- Requires test users with each role, or runs as current user with diagnostic queries
--
-- NOTE: These are assertion-style tests. When a test fails, DO NOT THROW. Instead,
--       print FAIL + details so all tests run and results are visible at once.

-- ============================================================================
-- Helper: print test result
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'RLS Policy Test Suite — starting';
  RAISE NOTICE '========================================';
END $$;

-- ============================================================================
-- 1. Policy existence checks
--    Verifies every table has at least one RLS policy and RLS is enabled
-- ============================================================================

DO $$
DECLARE
  rec RECORD;
  missing_policies TEXT[] := '{}';
BEGIN
  FOR rec IN
    SELECT c.oid::regclass::text AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = false
    ORDER BY tbl
  LOOP
    missing_policies := missing_policies || rec.tbl;
  END LOOP;

  IF array_length(missing_policies, 1) > 0 THEN
    RAISE WARNING 'FAIL — Tables WITHOUT RLS enabled: %', array_to_string(missing_policies, ', ');
  ELSE
    RAISE NOTICE 'PASS — All user tables have RLS enabled';
  END IF;
END $$;

DO $$
DECLARE
  rec RECORD;
  unprotected TEXT[] := '{}';
BEGIN
  FOR rec IN
    SELECT c.oid::regclass::text AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.reltuples > 0  -- has data
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = c.relname::text
      )
    ORDER BY tbl
  LOOP
    unprotected := unprotected || rec.tbl;
  END LOOP;

  IF array_length(unprotected, 1) > 0 THEN
    RAISE WARNING 'FAIL — Tables WITHOUT any policy: %', array_to_string(unprotected, ', ');
  ELSE
    RAISE NOTICE 'PASS — All tables with data have policies';
  END IF;
END $$;

-- ============================================================================
-- 2. Role-based access: profiles table
--    Both because it's fundamental and because it tests the subquery pattern
-- ============================================================================

DO $$
DECLARE
  v_count int;
BEGIN
  -- Admin/manager should be able to SELECT all profiles
  -- We test via the policy definition (admin/manager can see all)
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'profiles'
    AND policyname IN (
      'profiles_admin_all',
      'profiles_read_own',
      'profiles_update_own'
    );

  IF v_count = 3 THEN
    RAISE NOTICE 'PASS — profiles has 3 role-based policies';
  ELSE
    RAISE WARNING 'FAIL — profiles expected 3 policies, found %', v_count;
  END IF;
END $$;

-- ============================================================================
-- 3. Clients access pattern (admin/manager all, CSM own, analyst read)
-- ============================================================================

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'clients'
    AND policyname IN (
      'clients_admin_all',
      'clients_csm_select',
      'clients_analyst_select'
    );

  IF v_count = 3 THEN
    RAISE NOTICE 'PASS — clients has all 3 role-based policies';
  ELSE
    RAISE WARNING 'FAIL — clients expected 3 policies, found %', v_count;
  END IF;
END $$;

-- ============================================================================
-- 4. Template pattern: count policies on reference tables
--    Reference tables should have: admin_all + authenticated_read
-- ============================================================================

DO $$
DECLARE
  rec RECORD;
  ref_tables TEXT[] := ARRAY[
    'catalog_items', 'health_config', 'health_rules',
    'onboarding_activity_types', 'onboarding_capabilities',
    'onboarding_config', 'onboarding_fase_types',
    'contact_phones', 'contacts', 'segments', 'stages',
    'project_template_activities', 'project_template_fases', 'project_templates'
  ];
BEGIN
  FOR rec IN
    SELECT unnest(ref_tables) AS tbl
    EXCEPT
    SELECT tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(ref_tables)
      AND policyname LIKE '%admin_all%'
  LOOP
    RAISE WARNING 'FAIL — % missing admin_all policy', rec.tbl;
  END FOR;
END $$;

-- ============================================================================
-- 5. Phase 2.5 — Specific policy fixes
-- ============================================================================

DO $$
DECLARE
  v_count int;
BEGIN
  -- email_logs: should have read_admin_manager policy, NOT authenticated_read_logs
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'email_logs'
    AND policyname = 'email_logs_read_admin_manager';

  IF v_count = 1 THEN
    RAISE NOTICE 'PASS — email_logs has admin_manager read policy';
  ELSE
    RAISE WARNING 'FAIL — email_logs missing admin_manager read policy';
  END IF;

  -- Old policy should be gone
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'email_logs'
    AND policyname = 'authenticated_read_logs';

  IF v_count = 0 THEN
    RAISE NOTICE 'PASS — email_logs old blanket policy removed';
  ELSE
    RAISE WARNING 'FAIL — email_logs still has old blanket policy';
  END IF;

  -- ai_model_logs: should have insert_admin policy
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'ai_model_logs'
    AND policyname = 'ai_model_logs_insert_admin';

  IF v_count = 1 THEN
    RAISE NOTICE 'PASS — ai_model_logs has admin-only insert policy';
  ELSE
    RAISE WARNING 'FAIL — ai_model_logs missing admin-only insert policy';
  END IF;

  -- milestones: should use service_role
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'milestones'
    AND policyname = 'milestones_all_service';

  IF v_count = 1 THEN
    RAISE NOTICE 'PASS — milestones has service_role policy';
  ELSE
    RAISE WARNING 'FAIL — milestones missing service_role policy';
  END IF;

  -- brief_csm_notes: should have visible/own select policy
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'brief_csm_notes'
    AND policyname = 'brief_csm_notes_select_visible';

  IF v_count = 1 THEN
    RAISE NOTICE 'PASS — brief_csm_notes has visible/own select policy';
  ELSE
    RAISE WARNING 'FAIL — brief_csm_notes missing visible/own policy';
  END IF;

  -- freshdesk_config: admin/manager select only
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'freshdesk_config'
    AND policyname = 'freshdesk_config_select_admin_manager';

  IF v_count = 1 THEN
    RAISE NOTICE 'PASS — freshdesk_config has admin/manager select policy';
  ELSE
    RAISE WARNING 'FAIL — freshdesk_config missing admin/manager policy';
  END IF;

  -- client_donc_instances: admin/manager select only
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'client_donc_instances'
    AND policyname = 'client_donc_instances_read_admin_manager';

  IF v_count = 1 THEN
    RAISE NOTICE 'PASS — client_donc_instances has admin/manager select policy';
  ELSE
    RAISE WARNING 'FAIL — client_donc_instances missing admin/manager policy';
  END IF;
END $$;

-- ============================================================================
-- 6. Phase 2.4 — SECURITY DEFINER functions have explicit search_path
-- ============================================================================

DO $$
DECLARE
  v_has_search_path boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'check_marco_evidence'
      AND p.proconfig @> ARRAY['search_path=public']
  ) INTO v_has_search_path;

  IF v_has_search_path THEN
    RAISE NOTICE 'PASS — check_marco_evidence has explicit search_path';
  ELSE
    RAISE WARNING 'FAIL — check_marco_evidence missing explicit search_path';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_default_fases'
      AND p.proconfig @> ARRAY['search_path=public']
  ) INTO v_has_search_path;

  IF v_has_search_path THEN
    RAISE NOTICE 'PASS — create_default_fases has explicit search_path';
  ELSE
    RAISE WARNING 'FAIL — create_default_fases missing explicit search_path';
  END IF;
END $$;

-- ============================================================================
-- 7. Phase 1.2 — anon has been revoked from most tables
-- ============================================================================

DO $$
DECLARE
  v_tables_with_anon int;
  v_tables_expected int = 4; -- access_requests, profiles, client_reports, report_views
BEGIN
  SELECT COUNT(*) INTO v_tables_with_anon
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND grantee = 'anon'
    AND privilege_type = 'INSERT';

  IF v_tables_with_anon <= v_tables_expected THEN
    RAISE NOTICE 'PASS — anon INSERT grant limited to % tables (expected <= %)', v_tables_with_anon, v_tables_expected;
  ELSE
    RAISE WARNING 'FAIL — anon still has INSERT on % tables (expected <= %)', v_tables_with_anon, v_tables_expected;
  END IF;
END $$;

-- ============================================================================
-- 8. No blanket "Authenticated users" policies remain
-- ============================================================================

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname = 'Authenticated users';

  IF v_count = 0 THEN
    RAISE NOTICE 'PASS — all blanket "Authenticated users" policies removed';
  ELSE
    RAISE WARNING 'FAIL — % blanket policies still exist', v_count;
  END IF;
END $$;

-- ============================================================================
-- 9. Summary: list all current policies
-- ============================================================================

DO $$
DECLARE
  rec RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== Current policy inventory ===';
  FOR rec IN
    SELECT schemaname, tablename, policyname, permissive, roles, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  LOOP
    RAISE NOTICE '  %.% [%] % — %', rec.schemaname, rec.tablename, rec.policyname, rec.cmd, rec.roles;
  END LOOP;
  RAISE NOTICE '========================================';
  RAISE NOTICE 'RLS Policy Test Suite — complete';
END $$;
