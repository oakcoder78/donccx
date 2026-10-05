-- O motor registra ja_emitida quando a competencia ja existia (no-op idempotente).
-- O CHECK original so conhecia emitida/pulada/erro.
ALTER TABLE public.billing_run_log DROP CONSTRAINT IF EXISTS billing_run_log_outcome_check;
ALTER TABLE public.billing_run_log ADD CONSTRAINT billing_run_log_outcome_check
  CHECK (outcome = ANY (ARRAY['emitida','emitiria','ja_emitida','pulada','erro']));
