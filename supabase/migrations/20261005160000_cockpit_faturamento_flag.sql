-- ============================================================================
-- Flag do cockpit novo de faturamento (Fase 4), atras da qual a tela nova
-- aparece. Restrita a admin durante o teste; a pagina atual nao muda.
-- SDD: docs/sdd/financeiro-faturamento-sdd.md §6 Fase 4
-- ============================================================================

INSERT INTO public.feature_flags (key, description, enabled, allowed_roles)
VALUES (
  'cockpit_faturamento',
  'Cockpit novo de faturamento (Fase 4). Restrito a admin enquanto o fluxo E2E com dados de teste nao for aprovado.',
  true,
  ARRAY['admin']
)
ON CONFLICT (key) DO NOTHING;
