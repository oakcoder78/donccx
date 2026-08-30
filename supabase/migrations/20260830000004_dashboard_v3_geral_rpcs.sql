-- Dashboard v3 — company-wide ("geral") data for the Saúde / Projetos / Mapa /
-- Operacional blocks, for EVERY role. csm/sales cannot SELECT company-wide on
-- clients / projects / client_usage (RLS scopes them to their carteira), so
-- these SECURITY DEFINER RPCs are the sanctioned path — same pattern as
-- get_dashboard_ytd (Phase 2): aggregates + non-sensitive fields only, NO
-- mrr / billing_* / delay_days / contract_renewal.
-- The clients query (useDashboardClients) stays RLS-scoped and feeds the HERO
-- (carteira for csm/sales, company for admin/manager).
-- See docs/sdd/labs-dashboard-sdd.md §1.1 / §4.

-- ============================================================================
-- get_dashboard_clients_overview() — SaudeDimensaoBlock + EcossistemaMapBlock
-- ============================================================================
-- Non-sensitive per-client fields only. csm_temperature / temperature_updated_at
-- are included so the reused ClientHealthDrawer renders temperature for a
-- drilled-in client; mrr / billing_* / delay_days / contract_renewal are
-- deliberately excluded (gotcha A3).
DROP FUNCTION IF EXISTS public.get_dashboard_clients_overview();
CREATE OR REPLACE FUNCTION public.get_dashboard_clients_overview()
RETURNS TABLE (
  id int, name text, fantasy_name text, address_state text,
  health_total int, health_uso int, health_suporte int,
  health_relacionamento int, health_financeiro int, health_projeto int,
  csm_temperature int, temperature_updated_at timestamptz,
  csm_id uuid, comercial_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, name, fantasy_name, address_state,
    health_total, health_uso, health_suporte,
    health_relacionamento, health_financeiro, health_projeto,
    csm_temperature, temperature_updated_at,
    csm_id, comercial_id
  FROM public.clients
  WHERE lifecycle_stage = 'cliente' AND contract_active = true
  ORDER BY coalesce(fantasy_name, name);
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_clients_overview() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_clients_overview() TO authenticated;

-- ============================================================================
-- get_operational_deltas() — OperacionalVariacaoBlock
-- Previous closed month vs the month before it. Sums instances per client.
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_operational_deltas();
CREATE OR REPLACE FUNCTION public.get_operational_deltas()
RETURNS TABLE (
  client_id int, client_name text, csm_id uuid, comercial_id uuid,
  os_cur bigint, os_prev bigint,
  users_cur bigint, users_prev bigint,
  health_cur int, health_prev int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH months AS (
    SELECT to_char(current_date - interval '1 month', 'YYYY-MM') AS m_cur,
           to_char(current_date - interval '2 month', 'YYYY-MM') AS m_prev
  ),
  agg AS (
    SELECT cu.client_id, cu.ref_month,
      sum(coalesce((cu.donc_snapshot->>'totalOs')::bigint, cu.os_created, 0)) AS os,
      sum(coalesce(cu.active_users, 0)) AS users,
      max(cu.health_snapshot) AS health
    FROM public.client_usage cu, months
    WHERE cu.pending = false
      AND cu.instance_id IS NOT NULL
      AND cu.ref_month IN (months.m_cur, months.m_prev)
    GROUP BY cu.client_id, cu.ref_month
  )
  SELECT
    c.id, coalesce(c.fantasy_name, c.name), c.csm_id, c.comercial_id,
    coalesce(cur.os, 0)::bigint, coalesce(prev.os, 0)::bigint,
    coalesce(cur.users, 0)::bigint, coalesce(prev.users, 0)::bigint,
    cur.health, prev.health
  FROM public.clients c
  CROSS JOIN months
  LEFT JOIN agg cur ON cur.client_id = c.id AND cur.ref_month = months.m_cur
  LEFT JOIN agg prev ON prev.client_id = c.id AND prev.ref_month = months.m_prev
  WHERE c.lifecycle_stage = 'cliente'
    AND (cur.client_id IS NOT NULL OR prev.client_id IS NOT NULL);
$$;

REVOKE ALL ON FUNCTION public.get_operational_deltas() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_operational_deltas() TO authenticated;

-- ============================================================================
-- get_open_projects_overview() — ProjetosAbertosBlock
-- Lean port of useProjectCockpit.js: one row per client with an open project.
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_open_projects_overview();
CREATE OR REPLACE FUNCTION public.get_open_projects_overview()
RETURNS TABLE (
  client_id int, client_name text, csm_id uuid, comercial_id uuid,
  open_count int, current_phase text, progress int, display_status text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH by_client AS (
    SELECT p.client_id,
      count(*)::int AS open_count,
      (array_agg(p.onboarding_id) FILTER (WHERE p.onboarding_id IS NOT NULL))[1] AS onboarding_id
    FROM public.projects p
    WHERE p.status IN ('planejado', 'em_andamento')
    GROUP BY p.client_id
  ),
  fase_stats AS (
    SELECT f.onboarding_id,
      count(*) AS total,
      count(*) FILTER (WHERE f.status = 'concluida') AS done,
      count(*) FILTER (WHERE f.status = 'ativa') AS active
    FROM public.onboarding_fases f
    WHERE f.onboarding_id IN (SELECT onboarding_id FROM by_client WHERE onboarding_id IS NOT NULL)
    GROUP BY f.onboarding_id
  )
  SELECT
    bc.client_id,
    coalesce(cl.fantasy_name, cl.name),
    cl.csm_id,
    cl.comercial_id,
    bc.open_count,
    ft.name AS current_phase,
    CASE WHEN fs.total > 0
      THEN round((fs.done + fs.active * 0.5) / fs.total * 100)::int
      ELSE 0 END AS progress,
    CASE
      WHEN o.situacao_geral = 'travado' THEN 'paused'
      WHEN cf.planned_end IS NOT NULL AND cf.planned_end < current_date AND cf.status <> 'concluida' THEN 'delayed'
      ELSE 'on_time'
    END AS display_status
  FROM by_client bc
  JOIN public.clients cl ON cl.id = bc.client_id
  LEFT JOIN public.onboardings o ON o.id = bc.onboarding_id
  LEFT JOIN public.onboarding_fases cf ON cf.id = o.fase_atual_id
  LEFT JOIN public.onboarding_fase_types ft ON ft.id = cf.fase_type_id
  LEFT JOIN fase_stats fs ON fs.onboarding_id = bc.onboarding_id
  WHERE cl.lifecycle_stage = 'cliente'
  ORDER BY coalesce(cl.fantasy_name, cl.name);
$$;

REVOKE ALL ON FUNCTION public.get_open_projects_overview() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_open_projects_overview() TO authenticated;
