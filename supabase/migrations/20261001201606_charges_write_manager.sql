-- charges_write: +manager (was admin,finance,sales)
-- Context: 20260916120000 added manager to series_write, billing_payments_write and
-- billing_exceptions_write, but left charges_write untouched. A manager editing a
-- client contract saved the series fine (200) and then got 403 on the
-- contract_charges INSERT — the UI exposes the same editor to every role.
-- Aligns charges_write with series_write and with the financeiro_cockpit_write
-- feature flag, which already includes manager. Read policy unchanged.

DROP POLICY IF EXISTS charges_write ON public.contract_charges;
CREATE POLICY charges_write ON public.contract_charges FOR ALL USING (
  public.get_user_role() IN ('admin','manager','finance','sales')
) WITH CHECK (
  public.get_user_role() IN ('admin','manager','finance','sales')
);