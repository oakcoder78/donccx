-- ============================================================
-- 036 — Templates de Projeto
-- Permite criar templates de onboarding com fases e atividades padrão.
-- ============================================================

-- ── 1. Tabela de templates ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_templates (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  type        text NOT NULL CHECK (type IN ('onboarding', 'expansao', 'interno')),
  description text,
  is_default  boolean NOT NULL DEFAULT false,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, type)
);

-- ── 2. Fases do template ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_template_fases (
  id               serial PRIMARY KEY,
  template_id      integer NOT NULL REFERENCES public.project_templates(id) ON DELETE CASCADE,
  fase_type_id     integer NOT NULL REFERENCES public.onboarding_fase_types(id),
  display_order    integer NOT NULL DEFAULT 0,
  is_milestone     boolean NOT NULL DEFAULT false,
  requires_evidence boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, fase_type_id)
);

-- ── 3. Atividades do template por fase ─────────────────────────

CREATE TABLE IF NOT EXISTS public.project_template_activities (
  id               serial PRIMARY KEY,
  template_fase_id integer NOT NULL REFERENCES public.project_template_fases(id) ON DELETE CASCADE,
  activity_type_id integer NOT NULL REFERENCES public.onboarding_activity_types(id),
  display_order    integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_fase_id, activity_type_id)
);

-- ── 4. Índices ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_project_templates_type ON public.project_templates(type);
CREATE INDEX IF NOT EXISTS idx_project_templates_active ON public.project_templates(active);
CREATE INDEX IF NOT EXISTS idx_pt_fases_template ON public.project_template_fases(template_id);
CREATE INDEX IF NOT EXISTS idx_pt_activities_fase ON public.project_template_activities(template_fase_id);

-- ── 5. Trigger updated_at ──────────────────────────────────────

DROP TRIGGER IF EXISTS trg_project_templates_updated_at ON public.project_templates;
CREATE TRIGGER trg_project_templates_updated_at
  BEFORE UPDATE ON public.project_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 6. RLS ─────────────────────────────────────────────────────

ALTER TABLE public.project_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_template_fases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_template_activities ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_templates' AND policyname = 'Authenticated users') THEN
    CREATE POLICY "Authenticated users" ON public.project_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_template_fases' AND policyname = 'Authenticated users') THEN
    CREATE POLICY "Authenticated users" ON public.project_template_fases FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_template_activities' AND policyname = 'Authenticated users') THEN
    CREATE POLICY "Authenticated users" ON public.project_template_activities FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;