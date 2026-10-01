-- ============================================================================
-- Contract series lifecycle: contract_months + derived contract_renewal +
-- materialized recurrence horizon (SDD financeiro-cockpit adendo 2026-10-01)
--
-- Bug being fixed: a series with auto_renew=true stopped being billed once the
-- materialized recurrence ran out. Nothing in the billing path read auto_renew;
-- the horizon was N ("tempo de contrato"), expanded once on save. Client 21:
-- auto_renew, billing_end NULL, status ativa, recurrence ended 2025-09 — the
-- client vanished from the cockpit with no warning.
--
-- Design (see adendo):
--   contract_months   = duration of the contract (NOT the launch horizon)
--   contract_renewal  = derived: billing_start + contract_months
--   ensure_series_horizon() = the single materialization path, called by both
--     the form save and the monthly job, so the two cannot diverge
--
-- Applied via MCP: the supabase CLI in this environment is the Windows binary
-- with no linux-x64 package. See TD-012 in docs/backlog.md.
--
-- NOTE: the month_index computation in ensure_series_horizon shipped broken
-- here and was corrected in 20261001224750_ensure_series_horizon_fix_age_order.
-- ============================================================================

-- 1) contract_months — contract duration, separate from the launch horizon
ALTER TABLE public.contract_series ADD COLUMN IF NOT EXISTS contract_months smallint;

COMMENT ON COLUMN public.contract_series.contract_months IS
  'Duracao do contrato em meses. Define contract_renewal. NAO e o horizonte de lancamento — esse e materializado por ensure_series_horizon().';

-- Backfill from the recurrence already materialized: max(month_index) is what the
-- old "tempo de contrato" actually was. Series never launched stay NULL until
-- Financeiro fills them in.
UPDATE public.contract_series s
SET contract_months = agg.max_mi
FROM (
  SELECT series_id, max(month_index)::smallint AS max_mi
  FROM public.contract_charges
  WHERE kind = 'recorrencia'
  GROUP BY series_id
) agg
WHERE agg.series_id = s.id AND s.contract_months IS NULL;

-- 2) contract_renewal becomes derived. A BEFORE trigger rather than a GENERATED
--    column on purpose: the shipped form still writes contract_renewal in its
--    payload, and a generated column would reject that write until the front
--    change lands. The trigger overrides whatever the caller sends. Rows with
--    contract_months NULL keep their existing legacy value.
CREATE OR REPLACE FUNCTION public.sync_contract_series_renewal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.contract_months IS NOT NULL THEN
    NEW.contract_renewal := (NEW.billing_start + make_interval(months => NEW.contract_months))::date;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_contract_renewal ON public.contract_series;
CREATE TRIGGER trg_sync_contract_renewal
  BEFORE INSERT OR UPDATE OF billing_start, contract_months ON public.contract_series
  FOR EACH ROW EXECUTE FUNCTION public.sync_contract_series_renewal();

REVOKE ALL ON FUNCTION public.sync_contract_series_renewal() FROM anon, public, authenticated;

-- 3) month_index ceiling. The old CHECK (1..120) was an arbitrary cap from the
--    table creation, not a business rule. month_index counts from billing_start,
--    so client 21 (start 2022-10) hit it in 2032-09 and client 18 in 2033-12 —
--    after which the job would fail silently on every series, the same way this
--    bug presents. 600 = 50 years from the oldest start (2021).
--    NOTE: the form's "tempo de contrato" input keeps max=120 on purpose — that
--    is the contract duration, not this technical horizon. Do not "align" them.
ALTER TABLE public.contract_charges DROP CONSTRAINT IF EXISTS contract_charges_month_index_check;
ALTER TABLE public.contract_charges ADD CONSTRAINT contract_charges_month_index_check
  CHECK (month_index BETWEEN 1 AND 600);

-- 4) ensure_series_horizon — the one materialization path.
--    SECURITY INVOKER on purpose: RLS already gates it (series_write /
--    charges_write / billing_payments_write are the same four roles), and the
--    Edge Function runs as service_role which bypasses RLS.
--    Idempotent by explicit max(month_index) guard, NOT ON CONFLICT: the unique
--    index uq_charges_series_kind_month_group includes installment_group, and
--    every recurrence row has installment_group IS NULL — NULLs are distinct in
--    a Postgres unique index, so ON CONFLICT would never dedupe recurrence.
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

  -- month_index of p_target_month, matching refMonth() in src/lib/contractRules.js:
  -- both sides truncated to the first of the month so the day of billing_start
  -- cannot shift the index by one.
  v_to := (extract(year FROM age(date_trunc('month', v_series.billing_start),
                                 date_trunc('month', p_target_month)))::int * 12
         + extract(month FROM age(date_trunc('month', v_series.billing_start),
                                  date_trunc('month', p_target_month)))::int) + 1;
  v_to := least(greatest(v_to, 1), 600);
  v_from := v_last.month_index + 1;

  IF v_to < v_from THEN
    RETURN 0;
  END IF;

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
      (date_trunc('month', v_series.billing_start + make_interval(months => 1 - 1 + g.mi - 1))
        + make_interval(months => 1) - make_interval(days => 1))::date
    ),
    v_last.mode,
    v_last.amount,
    v_last.percent,
    v_last.label
  FROM generate_series(v_from, v_to) AS g(mi);

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted > 0 THEN
    -- Past months become adimplente by contract (Financeiro records real
    -- delinquency afterwards, month by month). A wrong billing_start invents
    -- months of billing and payment history — that is why billing_start needs
    -- care on the form.
    INSERT INTO public.billing_payments
      (client_id, series_id, ref_month, status, delay_days, paid_at)
    SELECT
      c.client_id,
      c.series_id,
      c.ref_month,
      'adimplente',
      0,
      least(
        (date_trunc('month', c.ref_month::date)
          + (coalesce(v_series.due_day, 5) - 1) * make_interval(days => 1))::date,
        (date_trunc('month', c.ref_month::date) + make_interval(months => 1)
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
  END IF;

  -- Contract shortened: billing_payments has no FK to contract_charges, so
  -- payments for months that stopped existing would be orphaned. Bounded by the
  -- last recurrence month rather than "no matching charge", so eventual-only
  -- months keep their payment row.
  DELETE FROM public.billing_payments bp
  WHERE bp.series_id = p_series_id
    AND bp.ref_month > v_last.ref_month;

  RETURN v_inserted;
END; $$;

REVOKE ALL ON FUNCTION public.ensure_series_horizon(uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ensure_series_horizon(uuid, date) TO authenticated, service_role;