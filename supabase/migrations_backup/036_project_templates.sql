CREATE TABLE public.project_templates (
  id            serial PRIMARY KEY,
  name          text NOT NULL,
  type          text CHECK (type IN ('onboarding','expansao','interno')) NOT NULL,
  description   text,
  is_default    boolean NOT NULL DEFAULT false,
  active        boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.project_template_fases (
  id                  serial PRIMARY KEY,
  template_id         integer NOT NULL REFERENCES public.project_templates(id) ON DELETE CASCADE,
  fase_type_id        integer NOT NULL REFERENCES public.onboarding_fase_types(id),
  display_order       integer NOT NULL DEFAULT 0,
  requires_evidence   boolean NOT NULL DEFAULT false
);

CREATE TABLE public.project_template_activities (
  id               serial PRIMARY KEY,
  template_id      integer NOT NULL REFERENCES public.project_templates(id) ON DELETE CASCADE,
  fase_type_id     integer NOT NULL REFERENCES public.onboarding_fase_types(id),
  activity_type_id integer NOT NULL REFERENCES public.onboarding_activity_types(id),
  display_order    integer NOT NULL DEFAULT 0
);

-- Seed: template padrão de onboarding
INSERT INTO public.project_templates (name, type, description, is_default, display_order)
VALUES ('Onboarding Padrão', 'onboarding', 'Template padrão para implantações iniciais', true, 1);

-- Fases do template padrão (IDs conforme onboarding_fase_types)
INSERT INTO public.project_template_fases (template_id, fase_type_id, display_order, requires_evidence)
VALUES
  (1, 1, 1, true),   -- Kickoff
  (1, 2, 2, false),  -- Definição do Escopo
  (1, 3, 3, true),   -- Projeto Técnico Aprovado
  (1, 4, 4, false),  -- Preparação da Plataforma
  (1, 5, 5, false),  -- Treinamento
  (1, 6, 6, true);   -- Go-Live

-- RLS
ALTER TABLE public.project_templates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_template_fases     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_template_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users" ON public.project_templates          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users" ON public.project_template_fases     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users" ON public.project_template_activities FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Triggers updated_at
CREATE TRIGGER trg_project_templates_updated_at
  BEFORE UPDATE ON public.project_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();