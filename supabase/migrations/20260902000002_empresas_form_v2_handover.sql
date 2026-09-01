-- Empresas v2 Phase 2 handover — Handoff Comercial → Onboarding
-- Creates template + satellite table client_handovers + migrates description -> contexto
-- Additive only (no DROP), labs-safe

-- 1) Template table (versioned structure, like brief_templates)
CREATE TABLE IF NOT EXISTS public.client_handover_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text UNIQUE NOT NULL,
  structure jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

INSERT INTO public.client_handover_templates (version, structure)
VALUES ('v1', '{
  "sections": [{
    "title": "Handoff Comercial → Onboarding",
    "questions": [
      {"key":"contexto", "label":"Contexto", "placeholder":"Contexto geral...", "required": true, "type":"textarea"},
      {"key":"como_trabalha", "label":"Como o cliente trabalha hoje?", "placeholder":"Situação atual, processos, ferramentas, volume...", "required": true, "type":"textarea"},
      {"key":"problemas", "label":"Quais problemas o cliente quer resolver?", "placeholder":"Quais problemas quer resolver?", "required": true, "type":"textarea"},
      {"key":"impactos", "label":"Quais são as consequências desses problemas?", "placeholder":"Consequências...", "required": true, "type":"textarea"},
      {"key":"necessidades", "label":"O que o cliente precisa que a solução resolva?", "placeholder":"O que precisa...", "required": true, "type":"textarea"},
      {"key":"resultados_esperados", "label":"Quais resultados concretos o cliente espera alcançar?", "placeholder":"Resultados concretos...", "required": true, "type":"textarea"},
      {"key":"criterios_sucesso", "label":"Como saberemos que o projeto foi bem-sucedido?", "placeholder":"Critérios de sucesso...", "required": true, "type":"textarea"},
      {"key":"pessoas", "label":"Quem são os principais envolvidos?", "placeholder":"Envolvidos, usuários, decisores, patrocinadores...", "required": true, "type":"textarea"},
      {"key":"expectativas", "label":"Que expectativas ou compromissos foram estabelecidos?", "placeholder":"Expectativas/compromissos da venda...", "required": true, "type":"textarea"},
      {"key":"riscos", "label":"Quais riscos, resistências ou particularidades?", "placeholder":"Riscos, resistências...", "required": true, "type":"textarea"},
      {"key":"motivo_compra", "label":"Por que o cliente escolheu nossa solução?", "placeholder":"Motivo da compra...", "required": true, "type":"textarea"}
    ]
  }]
}'::jsonb)
ON CONFLICT (version) DO NOTHING;

-- 2) Satellite table client_handovers (1:1 with clients)
CREATE TABLE IF NOT EXISTS public.client_handovers (
  client_id int PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  template_version text NOT NULL DEFAULT 'v1',
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  migrated_from_description boolean DEFAULT false,
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_handovers_gin ON public.client_handovers USING GIN (answers);
CREATE INDEX IF NOT EXISTS idx_handovers_template_version ON public.client_handovers(template_version);

ALTER TABLE public.client_handovers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS handovers_select ON public.client_handovers;
CREATE POLICY handovers_select ON public.client_handovers FOR SELECT USING (
  public.get_user_role() IN ('admin','manager','finance','sales','csm')
);

DROP POLICY IF EXISTS handovers_write ON public.client_handovers;
CREATE POLICY handovers_write ON public.client_handovers FOR ALL USING (
  public.get_user_role() IN ('admin','manager','finance','sales')
) WITH CHECK (
  public.get_user_role() IN ('admin','manager','finance','sales')
);

REVOKE ALL ON TABLE public.client_handovers FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_handovers TO authenticated;
REVOKE ALL ON TABLE public.client_handover_templates FROM anon, public;
GRANT SELECT ON TABLE public.client_handover_templates TO authenticated;
GRANT SELECT, INSERT ON TABLE public.client_handover_templates TO authenticated;

-- 3) Migrate legacy description -> contexto (only where description exists and handover not yet exists)
INSERT INTO public.client_handovers (client_id, answers, migrated_from_description, template_version)
SELECT id, jsonb_build_object('contexto', description), true, 'v1'
FROM public.clients
WHERE description IS NOT NULL AND trim(description) <> ''
ON CONFLICT (client_id) DO NOTHING;

-- 4) Keep clients.description deprecated (COMMENT), drop later in Phase 5 after verification
COMMENT ON COLUMN public.clients.description IS 'deprecated: use client_handovers.answers->>''contexto'' (Handoff Comercial → Onboarding). Will be dropped in Phase 5.';

-- Verify:
-- SELECT count(*) FROM client_handovers WHERE migrated_from_description=true;
-- SELECT * FROM client_handover_templates WHERE version='v1';
