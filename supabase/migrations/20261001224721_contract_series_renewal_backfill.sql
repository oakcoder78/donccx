-- Correction to 20261001224706: the contract_months backfill ran BEFORE
-- trg_sync_contract_renewal was created, so the derived contract_renewal was
-- never computed for the series that received contract_months in that same
-- migration (clients 18, 21 and 29 were left with contract_renewal NULL).
-- Ordering mistake, caught immediately after applying.
-- Touching the column re-fires the trigger and derives the value.
UPDATE public.contract_series
SET contract_months = contract_months
WHERE contract_months IS NOT NULL;