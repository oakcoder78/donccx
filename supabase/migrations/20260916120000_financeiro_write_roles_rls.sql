-- Financeiro write roles (manager/sales) + RLS on client_handover_templates
-- Context: manager got "new row violates RLS" on billing_payments and 406 on
-- contract_series save, while the UI flag financeiro_cockpit_write already
-- includes manager. Decision: write = admin/manager/finance/sales on
-- payments, exceptions and series. cockpit_financeiro read flag unchanged
-- (sales stays out of the cockpit UI per Q3 validation).
-- Also fixes Supabase advisor Critical: RLS disabled on client_handover_templates.

-- ============================================================================
-- 1) billing_payments_write: +manager, +sales (was admin,finance)
-- ============================================================================
DROP POLICY IF EXISTS billing_payments_write ON public.billing_payments;
CREATE POLICY billing_payments_write ON public.billing_payments FOR ALL USING (
  public.get_user_role() IN ('admin','manager','finance','sales')
) WITH CHECK (
  public.get_user_role() IN ('admin','manager','finance','sales')
);

-- ============================================================================
-- 2) billing_exceptions_write: +manager, +sales (was admin,finance)
-- ============================================================================
DROP POLICY IF EXISTS billing_exceptions_write ON public.billing_exceptions;
CREATE POLICY billing_exceptions_write ON public.billing_exceptions FOR ALL USING (
  public.get_user_role() IN ('admin','manager','finance','sales')
) WITH CHECK (
  public.get_user_role() IN ('admin','manager','finance','sales')
);

-- ============================================================================
-- 3) series_write: +manager (was admin,finance,sales)
-- ============================================================================
DROP POLICY IF EXISTS series_write ON public.contract_series;
CREATE POLICY series_write ON public.contract_series FOR ALL USING (
  public.get_user_role() IN ('admin','manager','finance','sales')
) WITH CHECK (
  public.get_user_role() IN ('admin','manager','finance','sales')
);

-- ============================================================================
-- 4) Mirror trigger as SECURITY DEFINER: it UPDATEs clients.delay_days and
--    would otherwise depend on each role's clients UPDATE policy
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_billing_payments_delay_days()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  latest_delay int;
BEGIN
  SELECT delay_days INTO latest_delay
  FROM public.billing_payments
  WHERE client_id = COALESCE(NEW.client_id, OLD.client_id)
  ORDER BY ref_month DESC
  LIMIT 1;

  UPDATE public.clients
  SET delay_days = COALESCE(latest_delay, 0)
  WHERE id = COALESCE(NEW.client_id, OLD.client_id);

  RETURN COALESCE(NEW, OLD);
END; $$;

-- ============================================================================
-- 5) client_handover_templates: enable RLS + read-only SELECT policy
--    (app only reads via useHandoverTemplates; seeds run as owner)
-- ============================================================================
ALTER TABLE public.client_handover_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS handover_templates_select ON public.client_handover_templates;
CREATE POLICY handover_templates_select ON public.client_handover_templates FOR SELECT USING (
  public.get_user_role() IN ('admin','manager','finance','sales','csm')
);

REVOKE ALL ON TABLE public.client_handover_templates FROM anon, public;
GRANT SELECT ON TABLE public.client_handover_templates TO authenticated;
