-- ============================================================
-- 029 — Unificação de Projetos e Onboarding
-- Adiciona type e onboarding_id em projects para permitir
-- visão unificada no dashboard mantendo lógica dedicada
-- de onboarding nas tabelas especializadas.
-- ============================================================

-- ── 1. Adiciona tipo do projeto ──────────────────────────────

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS type text
    CHECK (type IN ('onboarding', 'expansao', 'interno'))
    NOT NULL DEFAULT 'interno';

-- ── 2. Adiciona FK opcional para onboardings ─────────────────
-- Preenchida apenas quando type = 'onboarding' ou 'expansao'

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS onboarding_id integer
    REFERENCES public.onboardings(id) ON DELETE SET NULL;

-- ── 3. Constraint: onboarding_id obrigatório quando type = onboarding/expansao

ALTER TABLE public.projects
  ADD CONSTRAINT chk_project_onboarding_id CHECK (
    (type IN ('onboarding', 'expansao') AND onboarding_id IS NOT NULL)
    OR (type = 'interno' AND onboarding_id IS NULL)
  );

-- ── 4. Índices ───────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_projects_type          ON public.projects(type);
CREATE INDEX IF NOT EXISTS idx_projects_onboarding_id ON public.projects(onboarding_id);

-- ── 5. Projetos existentes: garantir type preenchido ─────────
-- Todos os projetos existentes não são onboarding — marcamos como 'interno'

UPDATE public.projects
  SET type = 'interno'
  WHERE type IS NULL OR type = 'interno';
