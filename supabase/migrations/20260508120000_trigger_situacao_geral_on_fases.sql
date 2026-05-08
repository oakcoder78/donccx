-- Recalculates situacao_geral when a fase's status or planned_end changes.
-- Previously the trigger only fired on onboarding_pendencias, leaving
-- situacao_geral stale after fase conclusions or deadline extensions.

CREATE OR REPLACE FUNCTION public.trg_fn_update_situacao_geral_fases()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_situacao_geral(OLD.onboarding_id);
  ELSE
    PERFORM public.recalculate_situacao_geral(NEW.onboarding_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_situacao_geral_fases ON public.onboarding_fases;

CREATE TRIGGER trg_update_situacao_geral_fases
  AFTER INSERT OR UPDATE OF status, planned_end OR DELETE
  ON public.onboarding_fases
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_update_situacao_geral_fases();
