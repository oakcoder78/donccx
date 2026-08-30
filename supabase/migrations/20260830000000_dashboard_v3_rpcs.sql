-- Dashboard v3 (Phase 2 — Data Foundation)
-- Company-wide aggregation RPCs for the "Nossa força em Números" (YTD) block and
-- the HERO operational deltas ("vs média 90 dias").
--
-- Both are SECURITY DEFINER on purpose: "toda a base" blocks show the same
-- ecosystem totals to every role (csm/sales/finance included), so they must
-- bypass the per-role SELECT RLS on clients / client_usage. They expose only
-- aggregates (counts, sums, averages) — no MRR, no billing, no per-client PII.
-- See docs/sdd/labs-dashboard-sdd.md §4.2 / §4.3.

-- ============================================================================
-- get_dashboard_ytd() — one row, year-to-date ecosystem numbers
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_dashboard_ytd()
RETURNS TABLE (
  clientes int,
  clientes_novos_ano int,
  os_criadas_ano bigint,
  profissionais_pico int,
  profissionais_pico_mes text,
  health_media numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT * FROM public.clients
    WHERE lifecycle_stage = 'cliente' AND contract_active = true
  ),
  usage_year AS (
    SELECT ref_month, active_users, os_created
    FROM public.client_usage
    WHERE pending = false
      AND instance_id IS NOT NULL
      AND ref_month LIKE to_char(current_date, 'YYYY') || '-%'
  ),
  prof_by_month AS (
    SELECT ref_month, sum(coalesce(active_users, 0)) AS profs
    FROM usage_year
    GROUP BY ref_month
  ),
  pico AS (
    SELECT ref_month, profs
    FROM prof_by_month
    ORDER BY profs DESC, ref_month DESC
    LIMIT 1
  )
  SELECT
    (SELECT count(*)::int FROM base),
    (SELECT count(*)::int FROM base
      WHERE date_part('year', contract_start) = date_part('year', current_date)),
    (SELECT coalesce(sum(os_created), 0)::bigint FROM usage_year),
    (SELECT coalesce(profs, 0)::int FROM pico),
    (SELECT ref_month FROM pico),
    (SELECT round(avg(health_total)::numeric, 1) FROM base WHERE health_total IS NOT NULL);
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_ytd() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_ytd() TO authenticated;

-- ============================================================================
-- get_operational_90d_avg() — current month vs trailing 3-month average
-- metric in ('os', 'profissionais'); ecosystem sums per ref_month.
-- mes_atual = latest completed ref_month; media_90d = avg of the 3 months
-- BEFORE it; delta_pct = (mes_atual - media_90d) / media_90d * 100.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_operational_90d_avg()
RETURNS TABLE (
  metric text,
  mes_atual numeric,
  media_90d numeric,
  delta_pct numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH monthly AS (
    SELECT
      ref_month,
      sum(coalesce(os_created, 0))    AS os,
      sum(coalesce(active_users, 0))  AS profissionais
    FROM public.client_usage
    WHERE pending = false AND instance_id IS NOT NULL
    GROUP BY ref_month
  ),
  ranked AS (
    SELECT *, row_number() OVER (ORDER BY ref_month DESC) AS rn
    FROM monthly
  ),
  m AS (
    SELECT
      (SELECT os FROM ranked WHERE rn = 1)            AS os_cur,
      (SELECT profissionais FROM ranked WHERE rn = 1) AS prof_cur,
      (SELECT avg(os) FROM ranked WHERE rn BETWEEN 2 AND 4)            AS os_avg,
      (SELECT avg(profissionais) FROM ranked WHERE rn BETWEEN 2 AND 4) AS prof_avg
  )
  SELECT 'os'::text,
         round(coalesce(os_cur, 0)::numeric, 0),
         round(coalesce(os_avg, 0)::numeric, 0),
         CASE WHEN coalesce(os_avg, 0) > 0
              THEN round(((os_cur - os_avg) / os_avg * 100)::numeric, 1)
              ELSE NULL END
  FROM m
  UNION ALL
  SELECT 'profissionais'::text,
         round(coalesce(prof_cur, 0)::numeric, 0),
         round(coalesce(prof_avg, 0)::numeric, 0),
         CASE WHEN coalesce(prof_avg, 0) > 0
              THEN round(((prof_cur - prof_avg) / prof_avg * 100)::numeric, 1)
              ELSE NULL END
  FROM m;
$$;

REVOKE ALL ON FUNCTION public.get_operational_90d_avg() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_operational_90d_avg() TO authenticated;
