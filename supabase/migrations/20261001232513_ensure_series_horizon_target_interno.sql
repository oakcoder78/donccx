-- Fold the horizon target into ensure_series_horizon so the form save and the
-- monthly job cannot drift: previously the caller computed "where should the
-- recurrence reach", and two callers would have meant two definitions.
--
-- The caller now just says which series. The function decides:
--   auto_renew (or billing_end IS NULL) -> current month + 12, rolls forever
--   signed term                          -> min(current + 12, last billed month)
--
-- The 12-month folga also lives here: with two callers it would have been two
-- constants that could drift.
CREATE OR REPLACE FUNCTION public.ensure_series_horizon(p_series_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_series public.contract_series%ROWTYPE;
  v_last   record;
  v_target date;
  v_folga  integer := 12;
  v_from   integer;
  v_to     integer;
  v_inserted integer := 0;
BEGIN
  -- row lock: the form save and the monthly job must not materialize at once
  SELECT * INTO v_series FROM public.contract_series WHERE id = p_series_id FOR UPDATE;
  IF NOT FOUND OR v_series.status <> 'ativa' THEN
    RETURN 0;
  END IF;

  -- last recurrence row is the template for the renewed months
  SELECT month_index, ref_month, mode, amount, percent, label
  INTO v_last
  FROM public.contract_charges
  WHERE series_id = p_series_id AND kind = 'recorrencia'
  ORDER BY month_index DESC
  LIMIT 1;

  -- series with no recurrence (tiers/eventuais only) do not roll month to month
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Horizon: current month + folga, so a failed run cannot open a hole. It takes
  -- v_folga consecutive failures to actually lose a month. Those future rows are
  -- inert — every consumer filters on an exact ref_month, so they never reach
  -- MRR, pendências or reports.
  v_target := (date_trunc('month', current_date) + make_interval(months => v_folga))::date;

  IF NOT coalesce(v_series.auto_renew, false) AND v_series.billing_end IS NOT NULL THEN
    -- signed term: the folga never pushes past the last billed month
    IF v_series.contract_months IS NULL THEN
      RETURN 0;
    END IF;
    v_target := least(v_target,
      (date_trunc('month', v_series.billing_start)
        + make_interval(months => v_series.contract_months - 1))::date);
  END IF;

  -- month_index of the target, matching refMonth() in src/lib/contractRules.js.
  -- Both sides truncated to the first of the month so the day of billing_start
  -- cannot shift the index by one. age(a, b) returns a - b, hence target first.
  v_to := (extract(year FROM age(date_trunc('month', v_target),
                                 date_trunc('month', v_series.billing_start)))::int * 12
         + extract(month FROM age(date_trunc('month', v_target),
                                  date_trunc('month', v_series.billing_start)))::int) + 1;
  v_to := least(greatest(v_to, 1), 600);
  v_from := v_last.month_index + 1;

  IF v_to >= v_from THEN
    -- due_date is filled by trg_sync_charge_due_date, not here
    INSERT INTO public.contract_charges
      (client_id, series_id, kind, month_index, ref_month, mode, amount, percent, label)
    SELECT
      v_series.client_id,
      p_series_id,
      'recorrencia',
      g.mi,
      to_char(v_series.billing_start + make_interval(months => g.mi - 1), 'YYYY-MM'),
      v_last.mode,
      v_last.amount,
      v_last.percent,
      v_last.label
    FROM generate_series(v_from, v_to) AS g(mi);

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  -- Past months become adimplente by contract (Financeiro records real
  -- delinquency afterwards, month by month). A wrong billing_start invents
  -- months of billing and payment history — that is why billing_start needs
  -- care on the form. ref_month is 'YYYY-MM' text: parse via || '-01'.
  -- Future months are left alone on purpose: the folga must never pre-mark a
  -- payment that has not come due yet.
  INSERT INTO public.billing_payments
    (client_id, series_id, ref_month, status, delay_days, paid_at)
  SELECT
    c.client_id,
    c.series_id,
    c.ref_month,
    'adimplente',
    0,
    least(
      (date_trunc('month', (c.ref_month || '-01')::date)
        + (coalesce(v_series.due_day, 5) - 1) * make_interval(days => 1))::date,
      (date_trunc('month', (c.ref_month || '-01')::date) + make_interval(months => 1)
        - make_interval(days => 1))::date
    )
  FROM public.contract_charges c
  WHERE c.series_id = p_series_id
    AND c.kind = 'recorrencia'
    AND c.ref_month < to_char(current_date, 'YYYY-MM')
    AND NOT EXISTS (
      SELECT 1 FROM public.billing_payments bp
      WHERE bp.client_id = c.client_id
        AND bp.series_id = c.series_id
        AND bp.ref_month = c.ref_month
    );

  -- Re-read the horizon so the cleanup bounds on what exists NOW. Using the
  -- pre-insert value would delete the payments just written.
  SELECT ref_month INTO v_last
  FROM public.contract_charges
  WHERE series_id = p_series_id AND kind = 'recorrencia'
  ORDER BY month_index DESC
  LIMIT 1;

  -- Contract shortened: billing_payments has no FK to contract_charges, so
  -- payments for months that stopped existing would be orphaned. Bounded by the
  -- last recurrence month rather than "no matching charge", so eventual-only
  -- months keep their payment row.
  DELETE FROM public.billing_payments bp
  WHERE bp.series_id = p_series_id
    AND bp.ref_month > v_last.ref_month;

  RETURN v_inserted;
END; $$;

REVOKE ALL ON FUNCTION public.ensure_series_horizon(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ensure_series_horizon(uuid) TO authenticated, service_role;
DROP FUNCTION IF EXISTS public.ensure_series_horizon(uuid, date);
