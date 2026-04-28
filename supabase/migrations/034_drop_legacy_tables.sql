-- ============================================================
-- 034 — Drop Tabelas Legadas
-- Remove tabelas do modelo antigo de onboarding e milestones
-- de projetos. Projetos internos de teste (id 1, 2, 5) e seus
-- milestones são removidos. Simonetti (id 12) e Sipolatti
-- (id 11) são mantidos.
-- ============================================================

-- ── 1. Remove projetos de teste e seus dados vinculados ──────

DELETE FROM public.milestone_tasks
WHERE milestone_id IN (
  SELECT id FROM public.milestones
  WHERE project_id IN (1, 2, 5)
);

DELETE FROM public.milestones
WHERE project_id IN (1, 2, 5);

DELETE FROM public.projects
WHERE id IN (1, 2, 5);

-- ── 2. Drop tabelas legadas de onboarding ────────────────────

DROP TABLE IF EXISTS public.onboarding_tasks    CASCADE;
DROP TABLE IF EXISTS public.onboarding_phases   CASCADE;
DROP TABLE IF EXISTS public.onboarding_milestones CASCADE;
DROP TABLE IF EXISTS public.onboarding_capability_types CASCADE;

-- ── 3. Drop tabelas legadas de milestones de projetos ────────
-- Só dropamos após confirmar que milestone_tasks e milestones
-- estão vazias (dados de teste removidos no passo 1)

DROP TABLE IF EXISTS public.milestone_tasks CASCADE;
DROP TABLE IF EXISTS public.milestones       CASCADE;

-- ── 4. Remove funções obsoletas ──────────────────────────────

DROP FUNCTION IF EXISTS public.check_single_bloqueadora() CASCADE;
DROP FUNCTION IF EXISTS public.check_milestone_evidence() CASCADE;
