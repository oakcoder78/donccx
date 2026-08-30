-- Dashboard v3 (Phase 2 — Data Foundation)
-- get_finance_summary() — the security boundary for the finance HERO.
--
-- Gotcha A3: CLIENT_SELECT = '*' currently returns mrr / billing_* / delay_days /
-- contract_renewal to every role that can SELECT clients. With /dashboard serving
-- all six roles, hiding the finance card in the UI is not enough. This RPC is the
-- ONLY sanctioned path to MRR aggregates on the dashboard; the front-end calls it
-- solely when effectiveRole ∈ {admin, manager, finance}, and the RPC re-checks.
-- See docs/sdd/labs-dashboard-sdd.md §4.4.

CREATE OR REPLACE FUNCTION public.get_finance_summary()
RETURNS TABLE (
  mrr_mes numeric,
  mrr_ytd numeric,
  clientes_atraso int,
  valor_atraso numeric,
  renovacao_30d int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- coalesce guard: a JWT with a valid uid but no profiles row → get_user_role()
  -- returns NULL → 'NULL NOT IN (...)' is NULL → without coalesce the IF would not fire.
  IF coalesce(public.get_user_role(), '') NOT IN ('admin', 'manager', 'finance') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT mrr, delay_days, contract_renewal
    FROM public.clients
    WHERE lifecycle_stage = 'cliente' AND contract_active = true
  )
  SELECT
    coalesce(sum(mrr), 0)::numeric,
    -- YTD accrual estimate: current MRR × months elapsed this year
    (coalesce(sum(mrr), 0) * date_part('month', current_date))::numeric,
    count(*) FILTER (WHERE coalesce(delay_days, 0) > 0)::int,
    coalesce(sum(mrr) FILTER (WHERE coalesce(delay_days, 0) > 0), 0)::numeric,
    count(*) FILTER (
      WHERE contract_renewal IS NOT NULL
        AND contract_renewal >= current_date
        AND contract_renewal <= current_date + 30
    )::int
  FROM base;
END;
$$;

REVOKE ALL ON FUNCTION public.get_finance_summary() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_finance_summary() TO authenticated;
