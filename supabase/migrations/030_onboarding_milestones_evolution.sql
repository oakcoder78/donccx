ALTER TABLE public.onboarding_milestones
  ADD COLUMN IF NOT EXISTS planned_date      date,
  ADD COLUMN IF NOT EXISTS evidence_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS justificativa     text;

CREATE TABLE IF NOT EXISTS public.onboarding_config (
  id          serial PRIMARY KEY,
  key         text NOT NULL UNIQUE,
  value       text NOT NULL,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.onboarding_config (key, value, description)
VALUES
  ('kickoff_sla_days',        '5',  'Dias corridos para realização do Kickoff após criação do onboarding'),
  ('projeto_tecnico_sla_days','15', 'Dias corridos para aprovação do Projeto Técnico após o Kickoff'),
  ('go_live_sla_days',        '60', 'Dias corridos esperados para Go-Live após início do onboarding')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.check_milestone_evidence()
RETURNS trigger LANGUAGE plpgsql AS $func$
BEGIN
  IF NEW.occurred_at IS NULL OR OLD.occurred_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NOT NEW.evidence_required THEN
    RETURN NEW;
  END IF;

  IF NEW.justificativa IS NOT NULL AND trim(NEW.justificativa) != '' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.onboarding_evidencias
    WHERE milestone_id = NEW.id
      AND is_deleted = false
  ) THEN
    RAISE EXCEPTION 'Este milestone requer uma evidência registrada ou uma justificativa para ser concluído.';
  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_check_milestone_evidence ON public.onboarding_milestones;
CREATE TRIGGER trg_check_milestone_evidence
  BEFORE UPDATE ON public.onboarding_milestones
  FOR EACH ROW EXECUTE FUNCTION public.check_milestone_evidence();

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
    )
    OR EXISTS (
      SELECT 1 FROM public.onboarding_milestones
      WHERE onboarding_id = p_onboarding_id
        AND occurred_at IS NULL
        AND planned_date IS NOT NULL
        AND planned_date < CURRENT_DATE
    ) THEN 'atencao'
    ELSE 'fluindo'
  END,
  updated_at = now()
  WHERE id = p_onboarding_id;
END;
$func$;

ALTER TABLE public.onboarding_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'onboarding_config'
      AND policyname = 'Authenticated users'
  ) THEN
    CREATE POLICY "Authenticated users"
      ON public.onboarding_config
      FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_onb_milestones_planned
  ON public.onboarding_milestones(onboarding_id, planned_date)
  WHERE occurred_at IS NULL;