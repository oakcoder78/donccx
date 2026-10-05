-- ============================================================================
-- Fase 4: a lista de clientes ganha os dados de contrato e de uso, como na
-- tela de adimplencia: tipo, valor unitario, piso, uso, MRR minimo, MRR real
-- e excedente. Sao leituras: os numeros reais vem do registro do motor
-- (composicao das faturas emitidas), e o MRR minimo e piso x valor unitario.
-- ============================================================================

DROP FUNCTION IF EXISTS public.billing_cockpit_clientes(text);

CREATE OR REPLACE FUNCTION public.billing_cockpit_clientes(p_competencia text)
RETURNS TABLE(
  client_id     integer,
  client_name   text,
  series_ids    uuid[],
  estado        text,
  m_faturas     integer,
  n_em_aberto   integer,
  saldo_aberto  numeric,
  tipo          text,
  valor_unitario numeric,
  piso          integer,
  uso           bigint,
  mrr_minimo    numeric,
  mrr_real      numeric,
  excedente     numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_read_billing() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_competencia IS NULL OR p_competencia !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'competencia invalida (esperado YYYY-MM)' USING errcode = '22023';
  END IF;

  RETURN QUERY
  WITH ativos AS (
    SELECT s.client_id,
           array_agg(s.id ORDER BY s.id) AS series_ids,
           (array_agg(s.billing_type ORDER BY s.billing_start, s.id))[1] AS tipo_contrato,
           (array_agg(s.billing_base_value ORDER BY s.billing_start, s.id))[1] AS unit,
           (array_agg(s.billing_floor ORDER BY s.billing_start, s.id))[1] AS piso_contrato
    FROM public.contract_series s
    JOIN public.clients c ON c.id = s.client_id
    WHERE s.status = 'ativa' AND c.lifecycle_stage = 'cliente'
    GROUP BY s.client_id
  ),
  fat AS (
    SELECT v.client_id,
           count(*)::int AS m,
           count(*) FILTER (WHERE v.balance > 0)::int AS n,
           coalesce(sum(v.balance), 0) AS saldo
    FROM public.invoice_balance v
    WHERE v.competencia = p_competencia AND v.status = 'emitida'
    GROUP BY v.client_id
  ),
  comp AS (
    SELECT v.client_id,
           sum((l.detail->>'base')::numeric) AS base,
           sum((l.detail->>'excedente')::numeric) AS exc
    FROM public.invoice_balance v
    JOIN public.billing_run_log l ON l.invoice_id = v.id AND l.outcome = 'emitida' AND l.detail ? 'base'
    WHERE v.competencia = p_competencia AND v.status = 'emitida' AND v.kind = 'recorrencia'
    GROUP BY v.client_id
  ),
  us AS (
    SELECT u.client_id AS cid, u.uso_lic, u.uso_os
    FROM public.billing_client_usage(p_competencia) u
  )
  SELECT a.client_id,
         coalesce(c.fantasy_name, c.name),
         a.series_ids,
         CASE WHEN coalesce(f.m, 0) > 0 THEN 'com_fatura' ELSE 'sem_fatura' END,
         coalesce(f.m, 0),
         coalesce(f.n, 0),
         coalesce(f.saldo, 0),
         a.tipo_contrato,
         a.unit,
         a.piso_contrato,
         CASE WHEN a.tipo_contrato = 'fixo' THEN NULL
              WHEN a.tipo_contrato IN ('os', 'por_os') THEN coalesce(us.uso_os, 0)
              ELSE coalesce(us.uso_lic, 0) END,
         CASE WHEN a.tipo_contrato = 'fixo' THEN NULL
              ELSE round(a.piso_contrato * a.unit, 2) END,
         CASE WHEN comp.base IS NULL THEN NULL ELSE comp.base + comp.exc END,
         comp.exc
  FROM ativos a
  JOIN public.clients c ON c.id = a.client_id
  LEFT JOIN fat f ON f.client_id = a.client_id
  LEFT JOIN comp ON comp.client_id = a.client_id
  LEFT JOIN us ON us.cid = a.client_id
  ORDER BY coalesce(c.fantasy_name, c.name);
END $$;

REVOKE ALL ON FUNCTION public.billing_cockpit_clientes(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_cockpit_clientes(text) TO authenticated, service_role;
