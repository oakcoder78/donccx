-- Split health flag into business rules vs cockpit (TD: cockpits & dashboards review)
-- health              -> Health Score business rules
-- health_cockpit      -> Cockpit – Health Score (route /health)
-- Previous FLAG_GROUPS duplicated 'health' in both sections sharing one row;
-- this migration creates a dedicated row so allowed_roles can diverge.

-- 1) Create dedicated cockpit flag copying current health settings (so existing access preserved)
INSERT INTO public.feature_flags (key, description, enabled, allowed_roles)
SELECT
  'health_cockpit',
  'Cockpit – Health Score — scorecard de saúde da carteira',
  enabled,
  allowed_roles
FROM public.feature_flags
WHERE key = 'health'
ON CONFLICT (key) DO NOTHING;

-- Fallback if 'health' row did not exist yet (e.g. fresh DB): ensure row exists
INSERT INTO public.feature_flags (key, description, enabled, allowed_roles)
VALUES ('health_cockpit', 'Cockpit – Health Score — scorecard de saúde da carteira', true, ARRAY['admin','manager','csm'])
ON CONFLICT (key) DO NOTHING;

-- 2) Disambiguate original health description (business rules)
UPDATE public.feature_flags
SET description = 'Health Score — regras de negócio (cálculo e classificação)',
    updated_at = now()
WHERE key = 'health' AND description NOT LIKE 'Health Score — regras%';

-- 3) Standardize cockpits descriptions to Cockpit – <Tema> (EN) pattern
UPDATE public.feature_flags SET description = 'Cockpit – CS Radar — atividades e RMCs do CS', updated_at = now() WHERE key = 'cs_radar';
UPDATE public.feature_flags SET description = 'Cockpit – Projects — projetos ativos por cliente', updated_at = now() WHERE key = 'projects_cockpit';
UPDATE public.feature_flags SET description = 'Cockpit – Professionals — faturamento por profissionais', updated_at = now() WHERE key = 'profissionais_cockpit';
