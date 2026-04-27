-- ============================================================
-- 033 — Fases Configuráveis do Onboarding
-- Unifica fases e milestones em um único modelo configurável.
-- Cria onboarding_fase_types como catálogo global gerenciável
-- em Configurações. Recria onboarding_fases com nova estrutura.
-- Remove enums fixos de fase em activities e pendencias.
-- Atualiza triggers de situacao_geral e evidência.
-- ============================================================

-- ── 1. Limpa dados existentes para recriar ───────────────────

DELETE FROM public.onboarding_evidencias;
DELETE FROM public.onboarding_activities;
DELETE FROM public.onboarding_pendencias;
DELETE FROM public.onboarding_fases;
DELETE FROM public.onboarding_milestones;

-- ── 2. Catálogo de tipos de fase ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.onboarding_fase_types (
  id               serial PRIMARY KEY,
  name             text NOT NULL UNIQUE,
  description      text,
  is_milestone     boolean NOT NULL DEFAULT false,
  requires_evidence boolean NOT NULL DEFAULT false,
  display_order    integer NOT NULL DEFAULT 0,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Seed: fluxo padrão de onboarding
INSERT INTO public.onboarding_fase_types
  (name, description, is_milestone, requires_evidence, display_order)
VALUES
  ('Kickoff',                   'Reunião formal de abertura do onboarding',                          true,  true,  1),
  ('Definição do Escopo',       'Diagnóstico, coleta de informações e elaboração do projeto técnico', false, false, 2),
  ('Projeto Técnico Aprovado',  'Validação formal do escopo pelo cliente',                            true,  true,  3),
  ('Preparação da Plataforma',  'Configuração técnica, integrações e testes',                         false, false, 4),
  ('Treinamento',               'Capacitação dos usuários do cliente',                                false, false, 5),
  ('Go-Live',                   'Encerramento formal e entrada em operação',                          true,  true,  6)
ON CONFLICT (name) DO NOTHING;

-- ── 3. Recria onboarding_fases com nova estrutura ────────────

DROP TABLE IF EXISTS public.onboarding_fases CASCADE;

CREATE TABLE public.onboarding_fases (
  id                serial PRIMARY KEY,
  onboarding_id     integer NOT NULL REFERENCES public.onboardings(id) ON DELETE CASCADE,
  fase_type_id      integer NOT NULL REFERENCES public.onboarding_fase_types(id),
  display_order     integer NOT NULL DEFAULT 0,
  status            text CHECK (status IN ('pendente', 'ativa', 'concluida')) NOT NULL DEFAULT 'pendente',
  planned_start     date,
  planned_end       date,
  actual_start      date,
  actual_end        date,
  -- Campos de marco (is_milestone=true)
  occurred_at       timestamptz,
  evidence_required boolean NOT NULL DEFAULT false,  -- herdado do tipo, sobrescritível
  justificativa     text,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (onboarding_id, fase_type_id)
);

-- ── 4. Atualiza onboardings.fase_atual ───────────────────────
-- Troca o enum fixo por FK para onboarding_fases

ALTER TABLE public.onboardings
  DROP CONSTRAINT IF EXISTS onboardings_fase_atual_check;

ALTER TABLE public.onboardings
  DROP COLUMN IF EXISTS fase_atual;

ALTER TABLE public.onboardings
  ADD COLUMN fase_atual_id integer REFERENCES public.onboarding_fases(id) ON DELETE SET NULL;

-- Remove também escopo_congelado — agora controlado pela ordem das fases
ALTER TABLE public.onboardings
  DROP COLUMN IF EXISTS escopo_congelado;

-- ── 5. Atualiza onboarding_activities ────────────────────────
-- Troca enum de fase por FK para onboarding_fases

ALTER TABLE public.onboarding_activities
  DROP CONSTRAINT IF EXISTS onboarding_activities_fase_check;

ALTER TABLE public.onboarding_activities
  DROP COLUMN IF EXISTS fase;

ALTER TABLE public.onboarding_activities
  ADD COLUMN fase_id integer REFERENCES public.onboarding_fases(id) ON DELETE SET NULL;

-- ── 6. Atualiza onboarding_pendencias ────────────────────────

ALTER TABLE public.onboarding_pendencias
  DROP CONSTRAINT IF EXISTS onboarding_pendencias_fase_check;

ALTER TABLE public.onboarding_pendencias
  DROP COLUMN IF EXISTS fase;

ALTER TABLE public.onboarding_pendencias
  ADD COLUMN fase_id integer REFERENCES public.onboarding_fases(id) ON DELETE SET NULL;

-- ── 7. Atualiza onboarding_evidencias ────────────────────────
-- Troca milestone_id por fase_id (unificado)

ALTER TABLE public.onboarding_evidencias
  DROP CONSTRAINT IF EXISTS chk_evidencia_target;

ALTER TABLE public.onboarding_evidencias
  DROP COLUMN IF EXISTS milestone_id;

ALTER TABLE public.onboarding_evidencias
  ADD COLUMN IF NOT EXISTS fase_id integer REFERENCES public.onboarding_fases(id) ON DELETE CASCADE;

-- Nova constraint: evidência vinculada a pendência OU a fase (marco)
ALTER TABLE public.onboarding_evidencias
  ADD CONSTRAINT chk_evidencia_target CHECK (
    (pendencia_id IS NOT NULL AND fase_id IS NULL)
    OR (pendencia_id IS NULL AND fase_id IS NOT NULL)
  );

-- ── 8. Índices ───────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_onb_fase_types_active   ON public.onboarding_fase_types(active);
CREATE INDEX IF NOT EXISTS idx_onb_fases_onb           ON public.onboarding_fases(onboarding_id);
CREATE INDEX IF NOT EXISTS idx_onb_fases_status        ON public.onboarding_fases(onboarding_id, status);
CREATE INDEX IF NOT EXISTS idx_onb_fases_type          ON public.onboarding_fases(fase_type_id);
CREATE INDEX IF NOT EXISTS idx_onb_activities_fase     ON public.onboarding_activities(fase_id);
CREATE INDEX IF NOT EXISTS idx_onb_pendencias_fase     ON public.onboarding_pendencias(fase_id);
CREATE INDEX IF NOT EXISTS idx_onb_evidencias_fase     ON public.onboarding_evidencias(fase_id);

-- ── 9. Trigger: updated_at para onboarding_fase_types ────────

DROP TRIGGER IF EXISTS trg_onb_fase_types_updated_at ON public.onboarding_fase_types;
CREATE TRIGGER trg_onb_fase_types_updated_at
  BEFORE UPDATE ON public.onboarding_fase_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_onb_fases_updated_at ON public.onboarding_fases;
CREATE TRIGGER trg_onb_fases_updated_at
  BEFORE UPDATE ON public.onboarding_fases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 10. Trigger: evidência obrigatória ao concluir marco ─────

DROP TRIGGER IF EXISTS trg_check_milestone_evidence ON public.onboarding_milestones;

CREATE OR REPLACE FUNCTION public.check_marco_evidence()
RETURNS trigger LANGUAGE plpgsql AS $func$
BEGIN
  -- Só valida quando status muda para concluida pela primeira vez
  IF NEW.status != 'concluida' OR OLD.status = 'concluida' THEN
    RETURN NEW;
  END IF;

  -- Verifica se é um marco que requer evidência
  IF NOT NEW.evidence_required THEN
    RETURN NEW;
  END IF;

  -- Justificativa preenchida libera
  IF NEW.justificativa IS NOT NULL AND trim(NEW.justificativa) != '' THEN
    RETURN NEW;
  END IF;

  -- Verifica se existe evidência registrada
  IF NOT EXISTS (
    SELECT 1 FROM public.onboarding_evidencias
    WHERE fase_id = NEW.id
      AND is_deleted = false
  ) THEN
    RAISE EXCEPTION 'Este marco requer uma evidência registrada ou uma justificativa para ser concluído.';
  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_check_marco_evidence ON public.onboarding_fases;
CREATE TRIGGER trg_check_marco_evidence
  BEFORE UPDATE ON public.onboarding_fases
  FOR EACH ROW EXECUTE FUNCTION public.check_marco_evidence();

-- ── 11. Atualiza recalculate_situacao_geral ──────────────────

CREATE OR REPLACE FUNCTION public.recalculate_situacao_geral(p_onboarding_id integer)
RETURNS void LANGUAGE plpgsql AS $func$
BEGIN
  UPDATE public.onboardings
  SET situacao_geral = CASE
    -- Travado: pendência bloqueadora ativa
    WHEN EXISTS (
      SELECT 1 FROM public.onboarding_pendencias
      WHERE onboarding_id = p_onboarding_id
        AND prioridade = 'bloqueadora'
        AND status != 'encerrada'
    ) THEN 'travado'
    -- Atenção: prazo vencido em pendência aberta
    -- OU pendência alta aberta há mais de 7 dias
    -- OU marco com planned_end vencido sem conclusão
    WHEN EXISTS (
      SELECT 1 FROM public.onboarding_pendencias
      WHERE onboarding_id = p_onboarding_id
        AND status != 'encerrada'
        AND (
          (due_date IS NOT NULL AND due_date < CURRENT_DATE)
          OR (prioridade = 'alta' AND created_at < now() - interval '7 days')
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.onboarding_fases f
      JOIN public.onboarding_fase_types ft ON ft.id = f.fase_type_id
      WHERE f.onboarding_id = p_onboarding_id
        AND f.status != 'concluida'
        AND f.planned_end IS NOT NULL
        AND f.planned_end < CURRENT_DATE
    ) THEN 'atencao'
    ELSE 'fluindo'
  END,
  updated_at = now()
  WHERE id = p_onboarding_id;
END;
$func$;

-- ── 12. Remove triggers obsoletos de onboarding_milestones ───

DROP TRIGGER IF EXISTS trg_check_milestone_evidence   ON public.onboarding_milestones;
DROP TRIGGER IF EXISTS trg_onb_milestones_updated_at  ON public.onboarding_milestones;

-- ── 13. Trigger: congela escopo ao avançar além da Definição ─
-- Removido — escopo_congelado foi eliminado.
-- O controle de escopo passa a ser feito pela UI:
-- ao tentar adicionar capacidade com fase ativa além de
-- Definição do Escopo, a aplicação exibe aviso ao CSM.

DROP TRIGGER IF EXISTS trg_congelar_escopo           ON public.onboardings;
DROP TRIGGER IF EXISTS trg_check_escopo_congelado    ON public.onboarding_capabilities;
DROP FUNCTION IF EXISTS public.trg_fn_congelar_escopo();
DROP FUNCTION IF EXISTS public.check_escopo_congelado();

-- ── 14. RLS ──────────────────────────────────────────────────

ALTER TABLE public.onboarding_fase_types ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'onboarding_fase_types'
      AND policyname = 'Authenticated users'
  ) THEN
    CREATE POLICY "Authenticated users"
      ON public.onboarding_fase_types
      FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── 15. Função auxiliar: cria fases padrão para novo onboarding

CREATE OR REPLACE FUNCTION public.create_default_fases(p_onboarding_id integer)
RETURNS void LANGUAGE plpgsql AS $func$
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
    INSERT INTO public.onboarding_fases (
      onboarding_id, fase_type_id, display_order,
      status, evidence_required
    ) VALUES (
      p_onboarding_id,
      v_type.id,
      v_type.display_order,
      CASE WHEN v_order = 1 THEN 'ativa' ELSE 'pendente' END,
      v_type.requires_evidence
    )
    ON CONFLICT (onboarding_id, fase_type_id) DO NOTHING;
  END LOOP;

  -- Define fase_atual_id como a primeira fase (ativa)
  UPDATE public.onboardings
  SET fase_atual_id = (
    SELECT id FROM public.onboarding_fases
    WHERE onboarding_id = p_onboarding_id
    ORDER BY display_order
    LIMIT 1
  )
  WHERE id = p_onboarding_id;
END;
$func$;

-- ── 16. Recria fases para onboardings existentes ─────────────

DO $func$ DECLARE v_id integer; BEGIN
  FOR v_id IN SELECT id FROM public.onboardings LOOP
    PERFORM public.create_default_fases(v_id);
  END LOOP;
END $func$;
