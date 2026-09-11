-- ============================================================================
-- Finance Cockpit — Detalhe: expõe `unit` e `floor` por série (extrato)
-- SDD: docs/sdd/financeiro-cockpit-sdd.md (adendo UI v2)
--
-- O extrato da competência mostra "valor por licença/OS" e "acima do piso";
-- `_financeiro_series_month` já retorna ambos — apenas repassa no jsonb.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_financeiro_detalhe(
  p_client_id int,
  p_ref_month text
)
RETURNS TABLE(
  series jsonb,
  modulos jsonb,
  excecoes jsonb,
  payment jsonb,
  profissionais jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(public.get_user_role(), '') NOT IN ('admin','manager','finance') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT jsonb_agg(jsonb_build_object(
              'series_id', s.series_id,
              'label', s.label,
              'kind', s.kind,
              'billing_type', s.billing_type,
              'mode', s.mode,
              'min', s.mrr_min,
              'uso', s.uso,
              'excedente', greatest(s.mrr_real - s.mrr_min, 0),
              'total', s.mrr_real,
              'unit', s.unit,
              'floor', s.billing_floor,
              'correction_index', s.correction_index,
              'correction_percent', s.correction_percent,
              'correction_anniversary', s.correction_anniversary,
              'contract_renewal', s.contract_renewal
            ) ORDER BY s.kind, s.label)
     FROM public._financeiro_series_month(p_ref_month) s
     WHERE s.client_id = p_client_id),
    (SELECT jsonb_agg(jsonb_build_object(
              'series_id', mp.series_id,
              'nome', ci.name,
              'valor_rateado', mp.additional_value,
              'pct', CASE WHEN tot.total > 0
                          THEN round(mp.additional_value / tot.total * 100, 1)
                          ELSE NULL END,
              'status', cc.status
            ) ORDER BY ci.name)
     FROM public.module_pricing mp
     LEFT JOIN public.catalog_items ci ON ci.id = mp.catalog_item_id
     LEFT JOIN public.client_catalog cc
            ON cc.client_id = mp.client_id AND cc.catalog_item_id = mp.catalog_item_id
     LEFT JOIN (
       SELECT m.client_id, sum(m.additional_value) AS total
       FROM public.module_pricing m
       WHERE m.client_id = p_client_id
       GROUP BY m.client_id
     ) tot ON tot.client_id = mp.client_id
     WHERE mp.client_id = p_client_id),
    (SELECT jsonb_agg(jsonb_build_object(
              'id', e.id,
              'escopo', CASE WHEN e.series_id IS NULL THEN 'cliente' ELSE 'serie' END,
              'series_id', e.series_id,
              'type', e.type,
              'percent', e.percent,
              'reduced_value', e.reduced_value,
              'unit_discount', e.unit_discount,
              'valid_from', e.valid_from,
              'valid_to', e.valid_to,
              'reason', e.reason,
              'created_by', e.created_by,
              'created_at', e.created_at
            ) ORDER BY e.valid_from DESC)
     FROM public.billing_exceptions e
     WHERE e.client_id = p_client_id
       AND p_ref_month BETWEEN to_char(e.valid_from, 'YYYY-MM') AND to_char(e.valid_to, 'YYYY-MM')),
    (SELECT jsonb_agg(jsonb_build_object(
              'series_id', bp.series_id,
              'status', bp.status,
              'delay_days', bp.delay_days,
              'paid_at', bp.paid_at,
              'note', bp.note
            ) ORDER BY bp.series_id)
     FROM public.billing_payments bp
     WHERE bp.client_id = p_client_id
       AND bp.ref_month = p_ref_month),
    (SELECT jsonb_agg(jsonb_build_object(
              'nome', prof->>'nome',
              'email', prof->>'email',
              'ativo', (prof->>'ativo')::boolean,
              'data_ultimo_login', prof->>'dataUltimoLogin',
              'data_ultima_os', prof->>'dataUltimaOS',
              'codigo_ultima_os', prof->>'codigoUltimaOS'
            ) ORDER BY prof->>'nome')
     FROM public.client_usage cu
     CROSS JOIN LATERAL jsonb_array_elements(cu.profissionais_versao) AS prof
     WHERE cu.client_id = p_client_id
       AND cu.ref_month = p_ref_month
       AND cu.profissionais_versao IS NOT NULL
       AND coalesce(cu.pending, false) = false);
END;
$$;

REVOKE ALL ON FUNCTION public.get_financeiro_detalhe(int, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_financeiro_detalhe(int, text) TO authenticated;
