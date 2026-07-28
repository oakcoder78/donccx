-- Feature flag + RPCs for Profissionais Cockpit
-- See docs/superpowers/specs/2026-07-26-profissionais-cockpit-design.md

-- ============================================================================
-- Feature flag
-- ============================================================================
INSERT INTO public.feature_flags (key, description, enabled, allowed_roles, updated_at)
VALUES (
  'profissionais_cockpit',
  'Profissionais Cockpit — dados de profissionais por cliente para faturamento',
  false,
  ARRAY['admin', 'manager', 'csm'],
  now()
)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- RPC 1: get_profissionais_cockpit
-- Returns 3 metrics per client (ativos, acesso no mes, OS no mes) with
-- cur/prev values and delta percentage.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_profissionais_cockpit(
  p_ref_month text
)
RETURNS TABLE(
  client_id int,
  client_name text,
  ativos_cur bigint,
  ativos_prev bigint,
  ativos_delta numeric,
  acesso_cur bigint,
  acesso_prev bigint,
  acesso_delta numeric,
  os_cur bigint,
  os_prev bigint,
  os_delta numeric
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  WITH expanded AS (
    -- Rows with profissionais_versao JSONB array
    SELECT
      cu.client_id,
      cu.ref_month,
      (prof->>'ativo')::boolean AS ativo,
      (prof->>'dataUltimoLogin')::timestamptz AS data_ultimo_login,
      (prof->>'dataUltimaOS')::timestamptz AS data_ultima_os
    FROM client_usage cu
    CROSS JOIN LATERAL jsonb_array_elements(cu.profissionais_versao) AS prof
    WHERE cu.ref_month IN (
          p_ref_month,
          to_char((p_ref_month || '-01')::date - interval '1 month', 'YYYY-MM')
        )
      AND cu.profissionais_versao IS NOT NULL
      AND cu.pending = false

    UNION ALL

    -- Fallback: rows without profissionais_versao — use active_users as count
    SELECT
      cu.client_id,
      cu.ref_month,
      true AS ativo,
      NULL::timestamptz AS data_ultimo_login,
      NULL::timestamptz AS data_ultima_os
    FROM client_usage cu
    CROSS JOIN LATERAL generate_series(1, cu.active_users) AS n
    WHERE cu.ref_month IN (
          p_ref_month,
          to_char((p_ref_month || '-01')::date - interval '1 month', 'YYYY-MM')
        )
      AND cu.profissionais_versao IS NULL
      AND cu.active_users > 0
      AND cu.pending = false
  ),
  counts AS (
    SELECT
      e.client_id,
      e.ref_month,
      COUNT(*) FILTER (WHERE e.ativo = true) AS ativos,
      COUNT(*) FILTER (
        WHERE e.data_ultimo_login IS NOT NULL
          AND e.data_ultimo_login >= (e.ref_month || '-01')::date
          AND e.data_ultimo_login < ((e.ref_month || '-01')::date + interval '1 month')
      ) AS acesso_mes,
      COUNT(*) FILTER (
        WHERE e.data_ultima_os IS NOT NULL
          AND e.data_ultima_os >= (e.ref_month || '-01')::date
          AND e.data_ultima_os < ((e.ref_month || '-01')::date + interval '1 month')
      ) AS os_mes
    FROM expanded e
    GROUP BY e.client_id, e.ref_month
  ),
  prev_month AS (
    SELECT to_char((p_ref_month || '-01')::date - interval '1 month', 'YYYY-MM') AS pm
  )
  SELECT
    cl.id,
    COALESCE(cl.fantasy_name, cl.name),
    COALESCE(cur.ativos, 0)::bigint,
    COALESCE(prv.ativos, 0)::bigint,
    CASE
      WHEN COALESCE(prv.ativos, 0) > 0
      THEN ROUND((COALESCE(cur.ativos, 0) - prv.ativos)::numeric / prv.ativos * 100, 1)
      ELSE NULL
    END,
    COALESCE(cur.acesso_mes, 0)::bigint,
    COALESCE(prv.acesso_mes, 0)::bigint,
    CASE
      WHEN COALESCE(prv.acesso_mes, 0) > 0
      THEN ROUND((COALESCE(cur.acesso_mes, 0) - prv.acesso_mes)::numeric / prv.acesso_mes * 100, 1)
      ELSE NULL
    END,
    COALESCE(cur.os_mes, 0)::bigint,
    COALESCE(prv.os_mes, 0)::bigint,
    CASE
      WHEN COALESCE(prv.os_mes, 0) > 0
      THEN ROUND((COALESCE(cur.os_mes, 0) - prv.os_mes)::numeric / prv.os_mes * 100, 1)
      ELSE NULL
    END
  FROM clients cl
  INNER JOIN (SELECT * FROM counts WHERE ref_month = p_ref_month) cur
    ON cl.id = cur.client_id
  LEFT JOIN prev_month pm_calc ON true
  LEFT JOIN counts prv
    ON cl.id = prv.client_id AND prv.ref_month = pm_calc.pm
  WHERE (COALESCE(cur.ativos, 0) > 0
    OR COALESCE(cur.acesso_mes, 0) > 0
    OR COALESCE(cur.os_mes, 0) > 0)
  ORDER BY cl.fantasy_name, cl.name;
$$;

-- ============================================================================
-- RPC 2: get_profissionais_detalhe
-- Returns individual professional list for a specific client/month.
-- Called lazily when expanding a client row.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_profissionais_detalhe(
  p_client_id int,
  p_ref_month text
)
RETURNS TABLE(
  nome text,
  email text,
  ativo boolean,
  data_ultimo_login text,
  data_ultima_os text,
  codigo_ultima_os text
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  -- Rows with profissionais_versao JSONB
  SELECT
    prof->>'nome' AS nome,
    prof->>'email' AS email,
    (prof->>'ativo')::boolean AS ativo,
    prof->>'dataUltimoLogin' AS data_ultimo_login,
    prof->>'dataUltimaOS' AS data_ultima_os,
    prof->>'codigoUltimaOS' AS codigo_ultima_os
  FROM client_usage cu
  CROSS JOIN LATERAL jsonb_array_elements(cu.profissionais_versao) AS prof
  WHERE cu.client_id = p_client_id
    AND cu.ref_month = p_ref_month
    AND cu.profissionais_versao IS NOT NULL
    AND cu.pending = false
    AND (
      (prof->>'ativo')::boolean = true
      OR (
        (prof->>'dataUltimoLogin') IS NOT NULL
        AND (prof->>'dataUltimoLogin')::timestamptz >= (p_ref_month || '-01')::date
        AND (prof->>'dataUltimoLogin')::timestamptz < ((p_ref_month || '-01')::date + interval '1 month')
      )
      OR (
        (prof->>'dataUltimaOS') IS NOT NULL
        AND (prof->>'dataUltimaOS')::timestamptz >= (p_ref_month || '-01')::date
        AND (prof->>'dataUltimaOS')::timestamptz < ((p_ref_month || '-01')::date + interval '1 month')
      )
    )

  UNION ALL

  -- Fallback: rows without profissionais_versao — generate from active_users count
  SELECT
    ('Profissional ' || n)::text AS nome,
    NULL::text AS email,
    true AS ativo,
    NULL::text AS data_ultimo_login,
    NULL::text AS data_ultima_os,
    NULL::text AS codigo_ultima_os
  FROM client_usage cu
  CROSS JOIN LATERAL generate_series(1, cu.active_users) AS n
  WHERE cu.client_id = p_client_id
    AND cu.ref_month = p_ref_month
    AND cu.profissionais_versao IS NULL
    AND cu.active_users > 0
    AND cu.pending = false
  ORDER BY nome;
$$;

-- ============================================================================
-- RPC 3: get_profissionais_export
-- Same as detalhe but for all clients at once. Used by CSV Analitico export.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_profissionais_export(
  p_ref_month text
)
RETURNS TABLE(
  client_id int,
  client_name text,
  nome text,
  email text,
  ativo boolean,
  data_ultimo_login text,
  data_ultima_os text,
  codigo_ultima_os text
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  -- Rows with profissionais_versao JSONB
  SELECT
    cu.client_id,
    COALESCE(c.fantasy_name, c.name) AS client_name,
    prof->>'nome' AS nome,
    prof->>'email' AS email,
    (prof->>'ativo')::boolean AS ativo,
    prof->>'dataUltimoLogin' AS data_ultimo_login,
    prof->>'dataUltimaOS' AS data_ultima_os,
    prof->>'codigoUltimaOS' AS codigo_ultima_os
  FROM client_usage cu
  JOIN clients c ON c.id = cu.client_id
  CROSS JOIN LATERAL jsonb_array_elements(cu.profissionais_versao) AS prof
  WHERE cu.ref_month = p_ref_month
    AND cu.profissionais_versao IS NOT NULL
    AND cu.pending = false
    AND (
      (prof->>'ativo')::boolean = true
      OR (
        (prof->>'dataUltimoLogin') IS NOT NULL
        AND (prof->>'dataUltimoLogin')::timestamptz >= (p_ref_month || '-01')::date
        AND (prof->>'dataUltimoLogin')::timestamptz < ((p_ref_month || '-01')::date + interval '1 month')
      )
      OR (
        (prof->>'dataUltimaOS') IS NOT NULL
        AND (prof->>'dataUltimaOS')::timestamptz >= (p_ref_month || '-01')::date
        AND (prof->>'dataUltimaOS')::timestamptz < ((p_ref_month || '-01')::date + interval '1 month')
      )
    )

  UNION ALL

  -- Fallback: rows without profissionais_versao — generate from active_users count
  SELECT
    cu.client_id,
    COALESCE(c.fantasy_name, c.name) AS client_name,
    ('Profissional ' || n)::text AS nome,
    NULL::text AS email,
    true AS ativo,
    NULL::text AS data_ultimo_login,
    NULL::text AS data_ultima_os,
    NULL::text AS codigo_ultima_os
  FROM client_usage cu
  JOIN clients c ON c.id = cu.client_id
  CROSS JOIN LATERAL generate_series(1, cu.active_users) AS n
  WHERE cu.ref_month = p_ref_month
    AND cu.profissionais_versao IS NULL
    AND cu.active_users > 0
    AND cu.pending = false
  ORDER BY client_name, nome;
$$;
