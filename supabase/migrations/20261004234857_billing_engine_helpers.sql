-- ============================================================================
-- Billing rebuild — Phase 2, migration 1/2: derivacao do motor
-- SDD: docs/sdd/financeiro-faturamento-sdd.md §3.1, §3.2
--
-- As duas pecas que o fechamento de competencia consulta por serie:
--   * billing_client_usage  — o uso do cliente no mes, agregado
--   * billing_series_rule   — a faixa de preco vigente para um month_index
--
-- Escritas a partir de pg_get_functiondef('_financeiro_series_month'), nao de
-- memoria: a primeira versao do SDD errou esta formula em seis pontos.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- billing_client_usage — uso do cliente, agregado sobre as instancias
-- ---------------------------------------------------------------------------
-- Um cliente pode ter mais de uma linha em client_usage por mes (instancias
-- diferentes do DONC). O engine vivo soma todas: LOJAS MM tem duas instancias,
-- 505 profissionais combinados em 2026-09. Contar uma linha so conta metade.
--
-- Linhas com pending=true ficam FORA do uso (nao sao faturaveis) mas aparecem
-- em tem_pending, que e o que o gate de completude do fechamento le.
--
-- OS usa donc_snapshot->>'totalOs' com fallback para os_created: o snapshot e o
-- valor corrigido.

CREATE OR REPLACE FUNCTION public.billing_client_usage(p_ref_month text)
RETURNS TABLE(
  client_id    integer,
  uso_lic      bigint,
  uso_os       bigint,
  tem_snapshot boolean,
  tem_pending  boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ids AS (
    SELECT DISTINCT cu.client_id FROM public.client_usage cu WHERE cu.ref_month = p_ref_month
  ),
  ok AS (
    SELECT cu.client_id,
           sum((SELECT count(*)
                FROM jsonb_array_elements(coalesce(cu.profissionais_versao, '[]'::jsonb)) e
                WHERE (e->>'ativo')::boolean))::bigint AS uso_lic,
           sum(coalesce((cu.donc_snapshot->>'totalOs')::bigint, cu.os_created, 0))::bigint AS uso_os
    FROM public.client_usage cu
    WHERE cu.ref_month = p_ref_month
      AND coalesce(cu.pending, false) = false
    GROUP BY cu.client_id
  ),
  pend AS (
    SELECT DISTINCT cu.client_id
    FROM public.client_usage cu
    WHERE cu.ref_month = p_ref_month AND coalesce(cu.pending, false) = true
  )
  SELECT i.client_id,
         coalesce(o.uso_lic, 0)::bigint,
         coalesce(o.uso_os, 0)::bigint,
         (o.client_id IS NOT NULL),
         (p.client_id IS NOT NULL)
  FROM ids i
  LEFT JOIN ok o ON o.client_id = i.client_id
  LEFT JOIN pend p ON p.client_id = i.client_id;
$$;

REVOKE ALL ON FUNCTION public.billing_client_usage(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_client_usage(text) TO service_role;

-- ---------------------------------------------------------------------------
-- billing_series_rule — a faixa vigente para um month_index
-- ---------------------------------------------------------------------------
-- Contiguidade e garantida pelo trigger da Fase 1, entao existe no maximo uma
-- faixa cobrindo cada mes.

CREATE OR REPLACE FUNCTION public.billing_series_rule(p_series_id uuid, p_month_index integer)
RETURNS TABLE(mode text, amount numeric, percent numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.mode, r.amount, r.percent
  FROM public.series_rules r
  WHERE r.series_id = p_series_id
    AND p_month_index >= r.month_from
    AND (r.month_to IS NULL OR p_month_index <= r.month_to)
  ORDER BY r.month_from
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.billing_series_rule(uuid, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_series_rule(uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Gate do F0
-- ---------------------------------------------------------------------------
-- Emissao de competencia anterior ao corte (2026-11) exige o F0 aprovado. A
-- flag registra a aprovacao (v1, 2026-10-03) e serve de trava: desliga-la
-- bloqueia emissao retroativa sem tocar em codigo.

INSERT INTO public.feature_flags (key, description, enabled, allowed_roles)
VALUES (
  'billing_f0_approved',
  'F0 aprovado — conferencia da carga historica (v1, 2026-10-03). Desligar bloqueia emissao de competencia anterior a 2026-11.',
  true,
  ARRAY['admin','manager','finance']
)
ON CONFLICT (key) DO NOTHING;
