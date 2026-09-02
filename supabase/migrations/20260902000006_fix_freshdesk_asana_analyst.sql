-- Fix: Asana button invisible for analyst (Thaisi Gomes) and future flag-aware roles
-- 1) freshdesk_config SELECT was restricted to admin/manager in 20260625200000_security_phase2_rls
--    but Atendimento reads asana_config/groups/agents/ticket_fields for every analyst/csm.
--    Allow authenticated to read non-sensitive integration keys; keep other keys admin/manager.
-- 2) feature_flags 'asana' and 'whatsapp_atendimento' must include analyst by default (Atendimento is analyst-facing)

-- ── 1) Relax SELECT on freshdesk_config for integration keys ─────────────────
DROP POLICY IF EXISTS "freshdesk_config_select_admin_manager" ON public.freshdesk_config;
DROP POLICY IF EXISTS "freshdesk_config_select_flag_aware" ON public.freshdesk_config;
DROP POLICY IF EXISTS "freshdesk_config_select_asana_groups" ON public.freshdesk_config;

CREATE POLICY "freshdesk_config_select_flag_aware" ON public.freshdesk_config
  FOR SELECT TO authenticated
  USING (
    -- admin/manager can read everything
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','manager'))
    -- any authenticated can read integration/config keys needed by Atendimento and AI
    OR key IN (
      'asana_config',
      'groups','agents','ticket_fields',
      'ai_models','ai_prompt','debug_config','email_rewrite_prompt',
      'last_sync'
    )
  );

COMMENT ON POLICY "freshdesk_config_select_flag_aware" ON public.freshdesk_config
  IS 'Allows any authenticated to read integration keys (asana_config etc) for Atendimento/Asana; other keys remain admin/manager. Frontend gates via feature_flags.isEnabled.';

-- ── 2) Enable asana + whatsapp_atendimento for analyst by default ───────────
-- whatsapp_atendimento is the gate for /atendimento route (App.jsx PrivateRoute)
UPDATE public.feature_flags
SET allowed_roles = (
  SELECT ARRAY(SELECT DISTINCT unnest(allowed_roles || ARRAY['analyst']))
  FROM public.feature_flags f2 WHERE f2.key = feature_flags.key
),
updated_at = now()
WHERE key IN ('asana','whatsapp_atendimento')
  AND NOT ('analyst' = ANY(allowed_roles));

-- Ensure rows exist if DB is fresh (idempotent)
INSERT INTO public.feature_flags (key, description, enabled, allowed_roles)
VALUES ('asana', 'Integração Asana — registrar tickets de atendimento como tarefas no Asana', true, ARRAY['admin','manager','analyst'])
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.feature_flags (key, description, enabled, allowed_roles)
VALUES ('whatsapp_atendimento', 'Atendimento WhatsApp — criar tickets Freshdesk a partir de conversas', true, ARRAY['admin','manager','analyst'])
ON CONFLICT (key) DO NOTHING;
