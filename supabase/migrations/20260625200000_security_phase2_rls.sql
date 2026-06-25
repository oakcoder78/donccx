-- Phase 2 — Harden SECURITY DEFINER functions + fix permissive RLS policies
-- See docs/security/SECURITY_REMEDIATION_PLAN.md

-- ============================================================================
-- 2.4 — Harden SECURITY DEFINER functions
-- ============================================================================

-- check_marco_evidence — add explicit search_path
CREATE OR REPLACE FUNCTION public.check_marco_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status != 'concluida' OR OLD.status = 'concluida' THEN
    RETURN NEW;
  END IF;
  IF NOT NEW.evidence_required THEN
    RETURN NEW;
  END IF;
  IF NEW.justificativa IS NOT NULL AND trim(NEW.justificativa) != '' THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.onboarding_evidencias
    WHERE fase_id = NEW.id AND is_deleted = false
  ) THEN
    RAISE EXCEPTION 'Este marco requer uma evidência registrada ou uma justificativa para ser concluído.';
  END IF;
  RETURN NEW;
END;
$$;

-- create_default_fases — add explicit search_path
CREATE OR REPLACE FUNCTION public.create_default_fases(p_onboarding_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type record;
  v_order integer := 0;
BEGIN
  FOR v_type IN
    SELECT id, is_milestone, requires_evidence, display_order
    FROM public.onboarding_fase_types
    WHERE active = true
    ORDER BY display_order
  LOOP
    v_order := v_order + 1;
    INSERT INTO public.onboarding_fases (onboarding_id, fase_type_id, display_order, status, evidence_required)
    VALUES (
      p_onboarding_id, v_type.id, v_type.display_order,
      CASE WHEN v_order = 1 THEN 'ativa' ELSE 'pendente' END,
      v_type.requires_evidence
    )
    ON CONFLICT (onboarding_id, fase_type_id) DO NOTHING;
  END LOOP;
  UPDATE public.onboardings
  SET fase_atual_id = (
    SELECT id FROM public.onboarding_fases
    WHERE onboarding_id = p_onboarding_id
    ORDER BY display_order LIMIT 1
  )
  WHERE id = p_onboarding_id;
END;
$$;

-- check_report_access — already has search_path, verified
-- handle_new_user — already has search_path, verified
-- register_report_view — already has search_path, verified

-- ============================================================================
-- 2.5 — Fix specific permissive RLS policies
-- ============================================================================

-- ── email_logs: restrict read to admin/manager, keep insert for Edge Functions ──

DROP POLICY IF EXISTS "authenticated_read_logs" ON public.email_logs;

CREATE POLICY "email_logs_read_admin_manager" ON public.email_logs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')
  ));

-- ── ai_model_logs: restrict insert to admin only ──

DROP POLICY IF EXISTS "Allow insert ai_model_logs" ON public.ai_model_logs;

CREATE POLICY "ai_model_logs_insert_admin" ON public.ai_model_logs
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- ── milestones: fix service_role policy (missing FOR ALL TO service_role) ──

DROP POLICY IF EXISTS "milestones_all_service" ON public.milestones;

CREATE POLICY "milestones_all_service" ON public.milestones
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ── brief_csm_notes: restrict select to visible OR own notes ──

DROP POLICY IF EXISTS "brief_csm_notes_select" ON public.brief_csm_notes;

CREATE POLICY "brief_csm_notes_select_visible" ON public.brief_csm_notes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
    OR is_visible = true
    OR created_by = auth.uid()
  );

-- ── freshdesk_config: restrict select to admin/manager ──

DROP POLICY IF EXISTS "freshdesk_config_select" ON public.freshdesk_config;

CREATE POLICY "freshdesk_config_select_admin_manager" ON public.freshdesk_config
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')
  ));

-- ── client_donc_instances: restrict select to admin/manager ──

DROP POLICY IF EXISTS "authenticated read instances" ON public.client_donc_instances;

CREATE POLICY "client_donc_instances_read_admin_manager" ON public.client_donc_instances
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')
  ));
