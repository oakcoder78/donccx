-- Empresas v2 Phase 1 core — additive only, labs-safe (no DROP)
-- Run: supabase db push --include-all  (only after QA in /labs/empresas_v2)
-- Covers: billing_status 3 states + suspended_until, billing_base_value 4 dec, erp/ti_tipo, flag

-- 1) billing_status enum (3 states) + suspended_until
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'ativo'
  CHECK (billing_status IN ('ativo','suspenso','nao_bilhetavel'));

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS billing_suspended_until date;

-- Enforce suspended_until required when suspenso (soft CHECK, app validates > today)
-- Note: deferred CHECK with CURRENT_DATE cannot be static; validate in app + trigger below
CREATE OR REPLACE FUNCTION public.check_billing_suspended_until() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.billing_status = 'suspenso' AND NEW.billing_suspended_until IS NULL THEN
    RAISE EXCEPTION 'billing_suspended_until required when billing_status is suspenso' USING errcode='23514';
  END IF;
  IF NEW.billing_status != 'suspenso' AND NEW.billing_suspended_until IS NOT NULL THEN
    -- allow clearing via app, but normalize to null if not suspenso (optional)
    -- keep as-is for audit; trigger does not clear
    NULL;
  END IF;
  -- keep contract_active in sync for legacy code (useClients CLIENT_SELECT='*', ClientDetail filters)
  NEW.contract_active := (NEW.billing_status = 'ativo');
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_check_billing_suspended_until ON public.clients;
CREATE TRIGGER trg_check_billing_suspended_until
  BEFORE INSERT OR UPDATE OF billing_status, billing_suspended_until ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.check_billing_suspended_until();

CREATE INDEX IF NOT EXISTS idx_clients_billing_status ON public.clients(billing_status);
CREATE INDEX IF NOT EXISTS idx_clients_billing_suspended_until ON public.clients(billing_suspended_until) WHERE billing_status='suspenso';

-- 2) 4 decimais for billing_base_value + module_pricing.additional_value
ALTER TABLE public.clients ALTER COLUMN billing_base_value TYPE numeric(12,4) USING billing_base_value::numeric(12,4);
ALTER TABLE public.module_pricing ALTER COLUMN additional_value TYPE numeric(12,4) USING additional_value::numeric(12,4);

-- 3) ERP / TI tipo (informativo)
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS erp text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS ti_tipo text CHECK (ti_tipo IN ('interna','terceirizada','hibrida','nao_possui'));

-- 4) Feature flag empresas_form_v2 (dedicated kill-switch, enabled false)
INSERT INTO public.feature_flags (key, description, enabled, allowed_roles, updated_at)
VALUES ('empresas_form_v2','Formulário Empresas v2 — página + contrato motor + handoff', false, ARRAY['admin','manager','finance','sales','csm'], now())
ON CONFLICT (key) DO UPDATE SET allowed_roles = ARRAY['admin','manager','finance','sales','csm'], updated_at = now();

-- Backfill: existing active clients already default 'ativo' via DEFAULT; no update needed
-- Verify: SELECT column_name, data_type, numeric_precision, numeric_scale FROM information_schema.columns WHERE table_name='clients' AND column_name IN ('billing_status','billing_suspended_until','billing_base_value','erp','ti_tipo');
-- Verify flag: SELECT * FROM feature_flags WHERE key='empresas_form_v2';
