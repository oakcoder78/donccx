-- Recurrence rows created through the form had due_date NULL: expandRulesToCharges
-- (src/lib/contractRules.js) never sets it, and the backfill in
-- 20260907000003_charges_due_date ran before those rows existed. 108 rows across
-- clients 18, 21 and 29 — the same defect, so the backfill covers all of them
-- rather than only the reported client.
--
-- Harmless today (get_financeiro_pendencias derives the due date from the series
-- due_day, not from the charge), but the table was internally inconsistent and
-- the rows ensure_series_horizon created did have due_date.
--
-- Backfill + trigger so the defect does not come back on the next series the
-- Financeiro registers. The trigger mirrors the contract_renewal decision: a
-- value derived from due_day belongs in the DB, not recomputed by each writer.
-- Only recurrence rows are touched — eventuais keep the due date the user
-- picked on the date picker.
--
-- The clamp is required: a plain ref_month || '-' || due_day cast throws
-- 22008 for due_day 30 in February (client 18 has exactly that case).

-- 1) backfill
UPDATE public.contract_charges c
SET due_date = least(
  (date_trunc('month', (c.ref_month || '-01')::date)
    + (coalesce(s.due_day, 5) - 1) * make_interval(days => 1))::date,
  (date_trunc('month', (c.ref_month || '-01')::date) + make_interval(months => 1)
    - make_interval(days => 1))::date
)
FROM public.contract_series s
WHERE s.id = c.series_id
  AND c.kind = 'recorrencia'
  AND c.due_date IS NULL
  AND c.ref_month IS NOT NULL;

-- 2) trigger for future rows
CREATE OR REPLACE FUNCTION public.sync_charge_due_date()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_due_day smallint;
BEGIN
  IF NEW.kind = 'recorrencia' AND NEW.ref_month IS NOT NULL THEN
    SELECT due_day INTO v_due_day FROM public.contract_series WHERE id = NEW.series_id;
    NEW.due_date := least(
      (date_trunc('month', (NEW.ref_month || '-01')::date)
        + (coalesce(v_due_day, 5) - 1) * make_interval(days => 1))::date,
      (date_trunc('month', (NEW.ref_month || '-01')::date) + make_interval(months => 1)
        - make_interval(days => 1))::date
    );
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_charge_due_date ON public.contract_charges;
CREATE TRIGGER trg_sync_charge_due_date
  BEFORE INSERT OR UPDATE OF kind, ref_month, series_id ON public.contract_charges
  FOR EACH ROW EXECUTE FUNCTION public.sync_charge_due_date();

REVOKE ALL ON FUNCTION public.sync_charge_due_date() FROM anon, public, authenticated;

-- 3) drop the now-redundant due_date computation from ensure_series_horizon so
--    the trigger is the single place that derives it. Same signature, so callers
--    are unaffected.
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
