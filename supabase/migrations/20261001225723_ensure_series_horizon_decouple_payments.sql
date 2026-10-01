-- Restructure: payment backfill and orphan cleanup were nested inside
-- "IF v_inserted > 0", so a run that had nothing new to launch also skipped
-- them. That stranded the 12 payments for 2025-10..2026-09 that the buggy
-- cleanup had deleted — re-running could not recover them.
--
-- Both steps are independently idempotent (NOT EXISTS on the payment insert;
-- the delete is bounded by the current horizon), so they now always run. This
-- also makes the function self-healing: any missing past payment is filled on
-- the next call, whoever triggers it.
CREATE OR REPLACE FUNCTION public.ensure_series_horizon(p_series_id uuid, p_target_month date)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_series public.contract_series%ROWTYPE;
  v_last   record;
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

  -- month_index of p_target_month, matching refMonth() in src/lib/contractRules.js.
  -- Both sides truncated to the first of the month so the day of billing_start
  -- cannot shift the index by one. age(a, b) returns a - b, hence target first.
  v_to := (extract(year FROM age(date_trunc('month', p_target_month),
                                 date_trunc('month', v_series.billing_start)))::int * 12
         + extract(month FROM age(date_trunc('month', p_target_month),
                                  date_trunc('month', v_series.billing_start)))::int) + 1;
  v_to := least(greatest(v_to, 1), 600);
  v_from := v_last.month_index + 1;

  IF v_to >= v_from THEN
    INSERT INTO public.contract_charges
      (client_id, series_id, kind, month_index, ref_month, due_date, mode, amount, percent, label)
    SELECT
      v_series.client_id,
      p_series_id,
      'recorrencia',
      g.mi,
      to_char(v_series.billing_start + make_interval(months => g.mi - 1), 'YYYY-MM'),
      least(
        (date_trunc('month', v_series.billing_start + make_interval(months => g.mi - 1))
          + (coalesce(v_series.due_day, 5) - 1) * make_interval(days => 1))::date,
        (date_trunc('month', v_series.billing_start + make_interval(months => g.mi - 1))
          + make_interval(months => 1) - make_interval(days => 1))::date
      ),
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
  -- Future months are left alone on purpose: the 12-month horizon must never
  -- pre-mark a payment that has not come due yet.
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
