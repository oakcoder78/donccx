-- Fix 400 "column reference client_id is ambiguous" on get_financeiro_cockpit:
-- unqualified client_id inside allc collides with the function's OUT parameter
-- (plpgsql variable). Qualify both UNION branches.
-- (Same signature: CREATE OR REPLACE is enough.)

CREATE OR REPLACE FUNCTION public.get_financeiro_cockpit(p_ref_month text)
RETURNS TABLE(
  client_id int,
  client_name text,
  cnpj text,
  saas_id text,
  billing_type text,
  billing_floor int,
  uso_cur bigint,
  uso_prev bigint,
  billable bigint,
  valor_unit numeric,
  correction_index text,
  correction_percent numeric,
  mrr_min numeric,
  mrr_real numeric,
  excedente numeric,
  eventuais numeric,
  series_count int,
  series_kinds text,
  excecao_desc text,
  excecao_escopo text,
  payment_status text,
  delay_days int,
  paid_at date,
  mrr_delta numeric,
  contract_renewal date,
  correction_anniversary date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev text := to_char((p_ref_month || '-01')::date - interval '1 month', 'YYYY-MM');
  v_first date := (p_ref_month || '-01')::date;
BEGIN
  IF coalesce(public.get_user_role(), '') NOT IN ('admin','manager','finance') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN QUERY
  WITH cur AS (
    SELECT * FROM public._financeiro_series_month(p_ref_month)
  ),
  prv AS (
    SELECT * FROM public._financeiro_series_month(v_prev)
  ),
  exc_client_cur AS (
    SELECT e.client_id,
           bool_or(e.type = 'isencao_total') AS isento,
           max(e.percent) FILTER (WHERE e.type = 'desconto_percent') AS pct,
           max(e.reduced_value) FILTER (WHERE e.type = 'valor_reduzido') AS reduced
    FROM public.billing_exceptions e
    WHERE e.series_id IS NULL
      AND p_ref_month BETWEEN to_char(e.valid_from, 'YYYY-MM') AND to_char(e.valid_to, 'YYYY-MM')
    GROUP BY e.client_id
  ),
  exc_client_prv AS (
    SELECT e.client_id,
           bool_or(e.type = 'isencao_total') AS isento,
           max(e.percent) FILTER (WHERE e.type = 'desconto_percent') AS pct,
           max(e.reduced_value) FILTER (WHERE e.type = 'valor_reduzido') AS reduced
    FROM public.billing_exceptions e
    WHERE e.series_id IS NULL
      AND v_prev BETWEEN to_char(e.valid_from, 'YYYY-MM') AND to_char(e.valid_to, 'YYYY-MM')
    GROUP BY e.client_id
  ),
  agg_cur AS (
    SELECT s.client_id,
           sum(s.mrr_min)::numeric AS min_sum,
           sum(s.mrr_real)::numeric AS real_sum,
           count(*)::int AS series_count,
           string_agg(DISTINCT s.kind, '+' ORDER BY s.kind) AS series_kinds,
           max(s.correction_index) AS correction_index,
           max(s.correction_percent) AS correction_percent,
           min(s.correction_anniversary) FILTER (WHERE s.correction_anniversary IS NOT NULL) AS correction_anniversary,
           min(s.contract_renewal) FILTER (WHERE s.contract_renewal IS NOT NULL) AS contract_renewal
    FROM cur s
    GROUP BY s.client_id
  ),
  agg_prv AS (
    SELECT s.client_id,
           sum(s.mrr_real)::numeric AS real_sum
    FROM prv s
    GROUP BY s.client_id
  ),
  fin_cur AS (
    SELECT a.*,
           CASE WHEN ec.isento THEN 0
                WHEN ec.reduced IS NOT NULL THEN ec.reduced
                WHEN ec.pct IS NOT NULL THEN a.min_sum * (1 - ec.pct / 100)
                ELSE a.min_sum END AS mrr_min,
           CASE WHEN ec.isento THEN 0
                WHEN ec.reduced IS NOT NULL THEN ec.reduced
                WHEN ec.pct IS NOT NULL THEN a.real_sum * (1 - ec.pct / 100)
                ELSE a.real_sum END AS mrr_real
    FROM agg_cur a
    LEFT JOIN exc_client_cur ec ON ec.client_id = a.client_id
  ),
  fin_prv AS (
    SELECT a.client_id,
           CASE WHEN ec.isento THEN 0
                WHEN ec.reduced IS NOT NULL THEN ec.reduced
                WHEN ec.pct IS NOT NULL THEN a.real_sum * (1 - ec.pct / 100)
                ELSE a.real_sum END AS mrr_real
    FROM agg_prv a
    LEFT JOIN exc_client_prv ec ON ec.client_id = a.client_id
  ),
  meta_cur AS (
    SELECT s.client_id,
           CASE WHEN count(DISTINCT s.billing_type) > 1 THEN 'mista'
                ELSE max(s.billing_type) END AS billing_type,
           max(s.billing_floor)::int AS billing_floor
    FROM cur s
    GROUP BY s.client_id
  ),
  usage_cur AS (
    SELECT cu.client_id,
           count(*) FILTER (WHERE (prof->>'ativo')::boolean)::bigint AS uso_lic
    FROM public.client_usage cu
    CROSS JOIN LATERAL jsonb_array_elements(cu.profissionais_versao) AS prof
    WHERE cu.ref_month = p_ref_month
      AND cu.profissionais_versao IS NOT NULL
      AND coalesce(cu.pending, false) = false
    GROUP BY cu.client_id
  ),
  usage_os_cur AS (
    SELECT cu.client_id,
           sum(coalesce((cu.donc_snapshot->>'totalOs')::bigint, cu.os_created, 0))::bigint AS uso_os
    FROM public.client_usage cu
    WHERE cu.ref_month = p_ref_month
      AND coalesce(cu.pending, false) = false
    GROUP BY cu.client_id
  ),
  usage_prv AS (
    SELECT cu.client_id,
           count(*) FILTER (WHERE (prof->>'ativo')::boolean)::bigint AS uso_lic
    FROM public.client_usage cu
    CROSS JOIN LATERAL jsonb_array_elements(cu.profissionais_versao) AS prof
    WHERE cu.ref_month = v_prev
      AND cu.profissionais_versao IS NOT NULL
      AND coalesce(cu.pending, false) = false
    GROUP BY cu.client_id
  ),
  usage_os_prv AS (
    SELECT cu.client_id,
           sum(coalesce((cu.donc_snapshot->>'totalOs')::bigint, cu.os_created, 0))::bigint AS uso_os
    FROM public.client_usage cu
    WHERE cu.ref_month = v_prev
      AND coalesce(cu.pending, false) = false
    GROUP BY cu.client_id
  ),
  ev_cur AS (
    SELECT c.client_id, sum(coalesce(c.amount, 0))::numeric AS total
    FROM public.contract_charges c
    WHERE c.kind = 'implantacao' AND c.ref_month = p_ref_month
    GROUP BY c.client_id
  ),
  valu AS (
    SELECT DISTINCT ON (s.client_id) s.client_id, s.unit
    FROM cur s
    ORDER BY s.client_id, (s.uso > 0) DESC, s.mrr_min DESC
  ),
  exc_any AS (
    SELECT DISTINCT ON (e.client_id)
           e.client_id, e.type, e.series_id, e.percent, e.unit_discount
    FROM public.billing_exceptions e
    WHERE p_ref_month BETWEEN to_char(e.valid_from, 'YYYY-MM') AND to_char(e.valid_to, 'YYYY-MM')
    ORDER BY e.client_id, (e.series_id IS NULL) ASC, e.created_at DESC
  ),
  pay AS (
    SELECT bp.client_id,
           bool_or(bp.status = 'inadimplente') AS any_late,
           bool_or(bp.status = 'adimplente') AS any_ok,
           max(bp.delay_days)::int AS delay_days,
           max(bp.paid_at) AS paid_at
    FROM public.billing_payments bp
    WHERE bp.ref_month = p_ref_month
    GROUP BY bp.client_id
  ),
  allc AS (
    SELECT fin_cur.client_id FROM fin_cur
    UNION
    SELECT ev_cur.client_id FROM ev_cur
  )
  SELECT
    cl.id,
    coalesce(cl.fantasy_name, cl.name),
    cl.cnpj,
    (SELECT string_agg(DISTINCT di.contrato_saas_id::text, ', ')
       FROM public.client_donc_instances di
      WHERE di.client_id = cl.id
        AND coalesce(di.active, true)),
    m.billing_type,
    coalesce(m.billing_floor, cl.billing_floor, 0),
    CASE WHEN m.billing_type = 'por_os' THEN coalesce(uo.uso_os, 0) ELSE coalesce(uc.uso_lic, 0) END,
    CASE WHEN m.billing_type = 'por_os' THEN coalesce(uop.uso_os, 0) ELSE coalesce(up.uso_lic, 0) END,
    CASE WHEN m.billing_type = 'por_os' THEN coalesce(uo.uso_os, 0)
         ELSE greatest(coalesce(uc.uso_lic, 0), coalesce(m.billing_floor, cl.billing_floor, 0)) END,
    coalesce(vl.unit, cl.billing_base_value, 0),
    fc.correction_index,
    fc.correction_percent,
    round(coalesce(fc.mrr_min, 0), 2),
    round(coalesce(fc.mrr_real, 0), 2),
    round(coalesce(fc.mrr_real, 0) - coalesce(fc.mrr_min, 0), 2),
    round(coalesce(ev.total, 0), 2),
    coalesce(fc.series_count, 0),
    fc.series_kinds,
    CASE ea.type
      WHEN 'isencao_total' THEN 'Isento'
      WHEN 'desconto_percent' THEN 'Desconto ' || trim(to_char(ea.percent, 'FM999D99')) || '%'
      WHEN 'valor_reduzido' THEN 'Valor reduzido'
      WHEN 'desconto_unidade' THEN 'Desconto ' || trim(to_char(ea.unit_discount, 'FM999D99')) || '/un.'
      ELSE NULL
    END,
    CASE WHEN ea.client_id IS NULL THEN NULL
         WHEN ea.series_id IS NULL THEN 'cliente'
         ELSE 'serie' END,
    CASE WHEN p.any_late THEN 'inadimplente'
         WHEN p.any_ok THEN 'adimplente'
         WHEN coalesce(cl.delay_days, 0) > 0 THEN 'inadimplente'
         ELSE NULL END,
    coalesce(p.delay_days, cl.delay_days, 0),
    p.paid_at,
    CASE WHEN coalesce(fp.mrr_real, 0) > 0
         THEN round((coalesce(fc.mrr_real, 0) - fp.mrr_real) / fp.mrr_real * 100, 1)
         ELSE NULL END,
    fc.contract_renewal,
    fc.correction_anniversary
  FROM allc
  JOIN public.clients cl ON cl.id = allc.client_id
  LEFT JOIN fin_cur fc ON fc.client_id = allc.client_id
  LEFT JOIN meta_cur m ON m.client_id = allc.client_id
  LEFT JOIN usage_cur uc ON uc.client_id = allc.client_id
  LEFT JOIN usage_prv up ON up.client_id = allc.client_id
  LEFT JOIN usage_os_cur uo ON uo.client_id = allc.client_id
  LEFT JOIN usage_os_prv uop ON uop.client_id = allc.client_id
  LEFT JOIN valu vl ON vl.client_id = allc.client_id
  LEFT JOIN exc_any ea ON ea.client_id = allc.client_id
  LEFT JOIN pay p ON p.client_id = allc.client_id
  LEFT JOIN ev_cur ev ON ev.client_id = allc.client_id
  LEFT JOIN fin_prv fp ON fp.client_id = allc.client_id
  WHERE cl.lifecycle_stage = 'cliente'
  ORDER BY cl.fantasy_name, cl.name;
END;
$$;
