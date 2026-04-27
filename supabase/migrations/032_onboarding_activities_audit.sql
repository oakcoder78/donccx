-- ============================================================
-- 032 — Atividades do Onboarding + Auditoria
-- Cria catálogo de tipos de atividade gerenciável em
-- Configurações, atividades vinculadas às fases do onboarding
-- e prepara uso da tabela audit_logs existente para o módulo
-- de projetos/onboarding.
-- ============================================================

-- ── 1. Catálogo de tipos de atividade ────────────────────────

CREATE TABLE IF NOT EXISTS public.onboarding_activity_types (
  id            serial PRIMARY KEY,
  name          text NOT NULL UNIQUE,
  description   text,
  active        boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Seed inicial baseado nas atividades do playbook
INSERT INTO public.onboarding_activity_types (name, description, display_order)
VALUES
  ('Diagnóstico operacional',        'Mapeamento dos processos e operações do cliente',                    1),
  ('Coleta de informações',          'Coleta de dados técnicos e operacionais necessários à implantação',  2),
  ('Definição de regras operacionais','Definição e validação das regras que regerão a operação',           3),
  ('Definição de integrações',       'Avaliação e definição de integrações técnicas necessárias',         4),
  ('Elaboração do projeto técnico',  'Documentação técnica da implantação',                               5),
  ('Validação do projeto técnico',   'Revisão e aprovação formal do projeto técnico pelo cliente',        6),
  ('Configuração da plataforma',     'Parametrização e configuração do ambiente do cliente',              7),
  ('Importação de dados',            'Importação e organização de bases de dados do cliente',             8),
  ('Desenvolvimento de integração',  'Desenvolvimento ou ativação de integrações técnicas',               9),
  ('Testes operacionais',            'Execução de testes para validação da configuração',                 10),
  ('Planejamento de treinamento',    'Definição de turmas, datas e formato dos treinamentos',             11),
  ('Execução de treinamento',        'Realização dos treinamentos com usuários do cliente',               12),
  ('Acompanhamento inicial',         'Suporte próximo durante os primeiros dias de operação real',        13)
ON CONFLICT (name) DO NOTHING;

-- ── 2. Atividades do Onboarding ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.onboarding_activities (
  id                     serial PRIMARY KEY,
  onboarding_id          integer NOT NULL REFERENCES public.onboardings(id) ON DELETE CASCADE,
  fase                   text CHECK (fase IN ('definicao_escopo', 'preparacao_plataforma', 'treinamento')) NOT NULL,
  activity_type_id       integer NOT NULL REFERENCES public.onboarding_activity_types(id),
  title                  text NOT NULL,  -- pode ser igual ao tipo ou customizado
  description            text,
  status                 text CHECK (status IN ('pendente', 'em_andamento', 'concluida')) NOT NULL DEFAULT 'pendente',
  responsible_contato_id integer REFERENCES public.contacts(id),
  responsible_interno_id uuid REFERENCES public.profiles(id),
  due_date               date,
  completed_at           timestamptz,
  display_order          integer NOT NULL DEFAULT 0,
  created_by             uuid REFERENCES public.profiles(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ── 3. Índices ───────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_onb_act_types_active    ON public.onboarding_activity_types(active);
CREATE INDEX IF NOT EXISTS idx_onb_activities_onb      ON public.onboarding_activities(onboarding_id);
CREATE INDEX IF NOT EXISTS idx_onb_activities_fase     ON public.onboarding_activities(onboarding_id, fase);
CREATE INDEX IF NOT EXISTS idx_onb_activities_status   ON public.onboarding_activities(status);

-- ── 4. Trigger: updated_at automático ────────────────────────

DROP TRIGGER IF EXISTS trg_onb_act_types_updated_at ON public.onboarding_activity_types;
CREATE TRIGGER trg_onb_act_types_updated_at
  BEFORE UPDATE ON public.onboarding_activity_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_onb_activities_updated_at ON public.onboarding_activities;
CREATE TRIGGER trg_onb_activities_updated_at
  BEFORE UPDATE ON public.onboarding_activities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 5. RLS ───────────────────────────────────────────────────

ALTER TABLE public.onboarding_activity_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_activities     ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'onboarding_activity_types'
      AND policyname = 'Authenticated users'
  ) THEN
    CREATE POLICY "Authenticated users"
      ON public.onboarding_activity_types
      FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'onboarding_activities'
      AND policyname = 'Authenticated users'
  ) THEN
    CREATE POLICY "Authenticated users"
      ON public.onboarding_activities
      FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;

END $$;

-- ── 6. Nota sobre auditoria ──────────────────────────────────
-- A tabela audit_logs existente será utilizada pelo frontend
-- para registrar eventos do módulo de projetos/onboarding.
-- entity_type esperados: project, onboarding, onboarding_fase,
-- onboarding_milestone, onboarding_activity, onboarding_pendencia
-- A inserção é feita pela aplicação (não por trigger SQL)
-- para garantir que user_id e user_name sejam sempre preenchidos.

-- ── 7. Atualiza onboarding_pendencias ────────────────────────
-- Adiciona vínculo opcional com atividade

ALTER TABLE public.onboarding_pendencias
  ADD COLUMN IF NOT EXISTS activity_id integer
    REFERENCES public.onboarding_activities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_onb_pendencias_activity
  ON public.onboarding_pendencias(activity_id);
