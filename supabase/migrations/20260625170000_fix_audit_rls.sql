-- Fix audit_logs RLS + seed logs feature flag
-- See docs/security/SDD-AUDIT.md

-- ============================================================================
-- G1 — Role-based RLS on audit_logs
-- Admin/manager see all logs, others see only their own
-- ============================================================================

DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;

CREATE POLICY "audit_logs_select_self_or_admin" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "audit_logs_insert_all" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- G3 — Seed logs feature flag
-- ============================================================================

INSERT INTO public.feature_flags (key, enabled, allowed_roles, description)
VALUES ('logs', true, ARRAY['admin', 'manager'], 'Access audit logs in Settings')
ON CONFLICT (key) DO NOTHING;
