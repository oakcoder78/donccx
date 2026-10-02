-- ============================================================================
-- Remove 'suspenso' from the billing_status vocabulary (contract-series-lifecycle
-- SDD, Phase E). Suspensão becomes a temporary concession in billing_exceptions —
-- the contracted value stays visible and the revenue loss shows up in the cockpit
-- instead of the series quietly reporting R$ 0 (and a zeroed series has been
-- invisible since v1.7 of the cockpit SDD).
--
-- No series uses 'suspenso' (0 of 26), so there is no backfill.
--
-- The contract_active sync is KEPT: monthly-sync:freshdesk filters on
-- contract_active = true, and removing it would break the ticket sync.
-- ============================================================================

-- 1) Vocabulary: two states, and suspenso is no longer accepted.
--    (clients.billing_status has a CHECK; contract_series.billing_status does not.)
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_billing_status_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.clients'::regclass
      AND conname = 'clients_billing_status_check'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_billing_status_check
      CHECK (billing_status IN ('ativo','nao_bilhetavel'));
  END IF;
END $$;

-- 2) Trigger without the suspension branch, still mirroring contract_active.
--    billing_suspended_until is no longer required, and is cleared when the status
--    is not suspenso so no orphan date is left behind.
CREATE OR REPLACE FUNCTION public.check_billing_suspended_until()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.billing_status <> 'suspenso' AND NEW.billing_suspended_until IS NOT NULL THEN
    NEW.billing_suspended_until := NULL;
  END IF;
  -- keep contract_active in sync for legacy code (useClients CLIENT_SELECT='*',
  -- ClientDetail filters, and monthly-sync:freshdesk filters contract_active)
  NEW.contract_active := (NEW.billing_status = 'ativo');
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_check_billing_suspended_until ON public.clients;
CREATE TRIGGER trg_check_billing_suspended_until
  BEFORE INSERT OR UPDATE OF billing_status, billing_suspended_until ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.check_billing_suspended_until();

-- 3) Clear orphan dates left by the old vocabulary.
UPDATE public.clients
SET billing_suspended_until = NULL
WHERE billing_status <> 'suspenso' AND billing_suspended_until IS NOT NULL;