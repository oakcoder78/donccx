-- ============================================================
-- 028 — Módulo de Onboarding
-- Tabelas dedicadas: onboardings, capacidades, fases,
-- milestones, pendências, evidências e tipos de capacidade.
-- Inclui triggers para situacao_geral, congelamento de escopo
-- e updated_at automático.
-- ============================================================

-- ── 1. Tipos de Capacidade (gerenciável pelo admin) ──────────

CREATE TABLE IF NOT EXISTS public.onboarding_capability_types (
  id            serial PRIMARY KEY,
  name          text NOT NULL UNIQUE,
  description   text,
  category      text CHECK (category IN ('operacao', 'modulo')) NOT NULL DEFAULT 'operacao',
  active        boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Seed inicial
INSERT INTO public.onboarding_capability_types (name, description, category, display_order)
VALUES
  ('Entrega',             'Operações de entrega de produtos ao cliente final',         'operacao', 1),
  ('Montagem',            'Operações de montagem e instalação de móveis e produtos',   'operacao', 2),
  ('Assistência Técnica', 'Operações de assistência técnica e manutenção pós-venda',  'operacao', 3),
  ('Roteirização',        'Módulo de roteirização automática de entregas',             'modulo',   4),
  ('Comunicação',         'Módulo de comunicação automatizada com cliente final',      'modulo',   5)
ON CONFLICT (name) DO NOTHING;

-- ── 2. Onboardings ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.onboardings (
  id               serial PRIMARY KEY,
  client_id        integer NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  csm_id           uuid REFERENCES public.profiles(id),
  title            text NOT NULL,
  context          text CHECK (context IN ('implantacao_inicial', 'expansao')) NOT NULL DEFAULT 'implantacao_inicial',
  fase_atual       text CHECK (fase_atual IN ('definicao_escopo', 'preparacao_plataforma', 'treinamento', 'encerrado')) NOT NULL DEFAULT 'definicao_escopo',
  situacao_geral   text CHECK (situacao_geral IN ('fluindo', 'atencao', 'travado')) NOT NULL DEFAULT 'fluindo',
  escopo_congelado boolean NOT NULL DEFAULT false,
  start_date       date,
  end_date         date,
  notes            text,
  status           text CHECK (status IN ('ativo', 'encerrado', 'cancelado')) NOT NULL DEFAULT 'ativo',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── 3. Capacidades do Onboarding ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.onboarding_capabilities (
  id                 serial PRIMARY KEY,
  onboarding_id      integer NOT NULL REFERENCES public.onboardings(id) ON DELETE CASCADE,
  capability_type_id integer NOT NULL REFERENCES public.onboarding_capability_types(id),
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (onboarding_id, capability_type_id)
);

-- ── 4. Fases do Onboarding ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.onboarding_fases (
  id            serial PRIMARY KEY,
  onboarding_id integer NOT NULL REFERENCES public.onboardings(id) ON DELETE CASCADE,
  fase          text CHECK (fase IN ('definicao_escopo', 'preparacao_plataforma', 'treinamento')) NOT NULL,
  planned_start date,
  planned_end   date,
  actual_start  date,
  actual_end    date,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (onboarding_id, fase)
);

-- ── 5. Milestones do Onboarding ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.onboarding_milestones (
  id            serial PRIMARY KEY,
  onboarding_id integer NOT NULL REFERENCES public.onboardings(id) ON DELETE CASCADE,
  type          text CHECK (type IN ('kickoff', 'projeto_tecnico_aprovado', 'go_live')) NOT NULL,
  occurred_at   date,
  evidence_text text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (onboarding_id, type)
);

-- ── 6. Pendências do Onboarding ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.onboarding_pendencias (
  id                       serial PRIMARY KEY,
  onboarding_id            integer NOT NULL REFERENCES public.onboardings(id) ON DELETE CASCADE,
  fase                     text CHECK (fase IN ('definicao_escopo', 'preparacao_plataforma', 'treinamento')),
  title                    text NOT NULL,
  description              text,
  prioridade               text CHECK (prioridade IN ('bloqueadora', 'alta', 'normal')) NOT NULL DEFAULT 'normal',
  status                   text CHECK (status IN ('criada', 'em_andamento', 'aguardando_validacao', 'encerrada')) NOT NULL DEFAULT 'criada',
  responsavel_contato_id   integer REFERENCES public.contacts(id),
  responsavel_interno_id   uuid REFERENCES public.profiles(id),
  responsavel_grupo        text,
  due_date                 date,
  resolved_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_responsavel CHECK (
    responsavel_contato_id IS NOT NULL
    OR responsavel_interno_id IS NOT NULL
    OR responsavel_grupo IS NOT NULL
  )
);

-- ── 7. Evidências ────────────────────────────────────────────
-- Reaproveitando bucket activity-attachments
-- Path: {clientId}/onboarding/{pendenciaId ou milestone_type}/arquivo

CREATE TABLE IF NOT EXISTS public.onboarding_evidencias (
  id            serial PRIMARY KEY,
  pendencia_id  integer REFERENCES public.onboarding_pendencias(id) ON DELETE CASCADE,
  milestone_id  integer REFERENCES public.onboarding_milestones(id) ON DELETE CASCADE,
  uploaded_by   uuid NOT NULL REFERENCES public.profiles(id),
  client_id     integer NOT NULL REFERENCES public.clients(id),
  file_name     text,
  file_size     integer,
  file_type     text,
  storage_path  text,
  evidence_text text,
  is_deleted    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_evidencia_target CHECK (
    (pendencia_id IS NOT NULL AND milestone_id IS NULL)
    OR (pendencia_id IS NULL AND milestone_id IS NOT NULL)
  )
);

-- ── 8. Índices ───────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_onboardings_client        ON public.onboardings(client_id);
CREATE INDEX IF NOT EXISTS idx_onboardings_status        ON public.onboardings(status);
CREATE INDEX IF NOT EXISTS idx_onboardings_situacao      ON public.onboardings(situacao_geral);
CREATE INDEX IF NOT EXISTS idx_onb_capabilities_onb      ON public.onboarding_capabilities(onboarding_id);
CREATE INDEX IF NOT EXISTS idx_onb_fases_onb             ON public.onboarding_fases(onboarding_id);
CREATE INDEX IF NOT EXISTS idx_onb_milestones_onb        ON public.onboarding_milestones(onboarding_id);
CREATE INDEX IF NOT EXISTS idx_onb_pendencias_onb        ON public.onboarding_pendencias(onboarding_id);
CREATE INDEX IF NOT EXISTS idx_onb_pendencias_status     ON public.onboarding_pendencias(status);
CREATE INDEX IF NOT EXISTS idx_onb_pendencias_prioridade ON public.onboarding_pendencias(prioridade);
CREATE INDEX IF NOT EXISTS idx_onb_evidencias_pendencia  ON public.onboarding_evidencias(pendencia_id);

-- ── 9. Trigger: máximo 1 bloqueadora ativa por onboarding ────

CREATE OR REPLACE FUNCTION public.check_single_bloqueadora()
RETURNS trigger LANGUAGE plpgsql AS $func$
BEGIN
  IF NEW.prioridade = 'bloqueadora' AND NEW.status != 'encerrada' THEN
    IF EXISTS (
      SELECT 1 FROM public.onboarding_pendencias
      WHERE onboarding_id = NEW.onboarding_id
        AND prioridade = 'bloqueadora'
        AND status != 'encerrada'
        AND id != COALESCE(NEW.id, -1)
    ) THEN
      RAISE EXCEPTION 'Já existe uma pendência bloqueadora ativa neste onboarding. Encerre a atual antes de criar outra.';
    END IF;
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_check_single_bloqueadora ON public.onboarding_pendencias;
CREATE TRIGGER trg_check_single_bloqueadora
  BEFORE INSERT OR UPDATE ON public.onboarding_pendencias
  FOR EACH ROW EXECUTE FUNCTION public.check_single_bloqueadora();

-- ── 10. Função + Trigger: recalcula situacao_geral ───────────

CREATE OR REPLACE FUNCTION public.recalculate_situacao_geral(p_onboarding_id integer)
RETURNS void LANGUAGE plpgsql AS $func$
BEGIN
  UPDATE public.onboardings
  SET situacao_geral = CASE
    WHEN EXISTS (
      SELECT 1 FROM public.onboarding_pendencias
      WHERE onboarding_id = p_onboarding_id
        AND prioridade = 'bloqueadora'
        AND status != 'encerrada'
    ) THEN 'travado'
    WHEN EXISTS (
      SELECT 1 FROM public.onboarding_pendencias
      WHERE onboarding_id = p_onboarding_id
        AND status != 'encerrada'
        AND (
          (due_date IS NOT NULL AND due_date < CURRENT_DATE)
          OR (prioridade = 'alta' AND created_at < now() - interval '7 days')
        )
    ) THEN 'atencao'
    ELSE 'fluindo'
  END,
  updated_at = now()
  WHERE id = p_onboarding_id;
END;
$func$;

CREATE OR REPLACE FUNCTION public.trg_fn_update_situacao_geral()
RETURNS trigger LANGUAGE plpgsql AS $func$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_situacao_geral(OLD.onboarding_id);
  ELSE
    PERFORM public.recalculate_situacao_geral(NEW.onboarding_id);
  END IF;
  RETURN NULL;
END;
$func$;

DROP TRIGGER IF EXISTS trg_update_situacao_geral ON public.onboarding_pendencias;
CREATE TRIGGER trg_update_situacao_geral
  AFTER INSERT OR UPDATE OR DELETE ON public.onboarding_pendencias
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_update_situacao_geral();

-- ── 11. Trigger: congela escopo ao iniciar Preparação ────────

CREATE OR REPLACE FUNCTION public.trg_fn_congelar_escopo()
RETURNS trigger LANGUAGE plpgsql AS $func$
BEGIN
  IF NEW.fase_atual = 'preparacao_plataforma'
     AND OLD.fase_atual = 'definicao_escopo' THEN
    NEW.escopo_congelado := true;
    NEW.updated_at       := now();
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_congelar_escopo ON public.onboardings;
CREATE TRIGGER trg_congelar_escopo
  BEFORE UPDATE ON public.onboardings
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_congelar_escopo();

-- ── 12. Trigger: bloqueia capacidade com escopo congelado ────

CREATE OR REPLACE FUNCTION public.check_escopo_congelado()
RETURNS trigger LANGUAGE plpgsql AS $func$
BEGIN
  IF (SELECT escopo_congelado FROM public.onboardings WHERE id = NEW.onboarding_id) THEN
    RAISE EXCEPTION 'O escopo deste onboarding está congelado. Novas capacidades devem originar um novo onboarding.';
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_check_escopo_congelado ON public.onboarding_capabilities;
CREATE TRIGGER trg_check_escopo_congelado
  BEFORE INSERT ON public.onboarding_capabilities
  FOR EACH ROW EXECUTE FUNCTION public.check_escopo_congelado();

-- ── 13. Trigger: updated_at automático ───────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $func$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_onb_fases_updated_at     ON public.onboarding_fases;
DROP TRIGGER IF EXISTS trg_onb_milestones_updated_at ON public.onboarding_milestones;
DROP TRIGGER IF EXISTS trg_onb_pendencias_updated_at ON public.onboarding_pendencias;

CREATE TRIGGER trg_onb_fases_updated_at
  BEFORE UPDATE ON public.onboarding_fases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_onb_milestones_updated_at
  BEFORE UPDATE ON public.onboarding_milestones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_onb_pendencias_updated_at
  BEFORE UPDATE ON public.onboarding_pendencias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 14. RLS ──────────────────────────────────────────────────

ALTER TABLE public.onboarding_capability_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboardings                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_capabilities     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_fases            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_milestones       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_pendencias       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_evidencias       ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'onboarding_capability_types' AND policyname = 'Authenticated users') THEN
    CREATE POLICY "Authenticated users" ON public.onboarding_capability_types FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'onboardings' AND policyname = 'Authenticated users') THEN
    CREATE POLICY "Authenticated users" ON public.onboardings FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'onboarding_capabilities' AND policyname = 'Authenticated users') THEN
    CREATE POLICY "Authenticated users" ON public.onboarding_capabilities FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'onboarding_fases' AND policyname = 'Authenticated users') THEN
    CREATE POLICY "Authenticated users" ON public.onboarding_fases FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'onboarding_milestones' AND policyname = 'Authenticated users') THEN
    CREATE POLICY "Authenticated users" ON public.onboarding_milestones FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'onboarding_pendencias' AND policyname = 'Authenticated users') THEN
    CREATE POLICY "Authenticated users" ON public.onboarding_pendencias FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'onboarding_evidencias' AND policyname = 'Authenticated users') THEN
    CREATE POLICY "Authenticated users" ON public.onboarding_evidencias FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

END $$;