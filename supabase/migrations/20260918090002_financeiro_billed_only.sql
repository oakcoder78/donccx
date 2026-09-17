-- Finance cockpit: billed-value-only entries + ev-only clients
-- 1) Engine exclusion drops all exemptions: a series appears iff raw_min > 0
--    or raw_real > 0 (launched zero + excedente shows). Nao cobrar / suspenso /
--    isento / paused never appear, even with launched periods.
-- 2) get_financeiro_cockpit lists clients with engine rows OR eventuais
--    (MRR 0 + eventual > 0). New eventuais column already added previously.

CREATE OR REPLACE FUNCTION public._financeiro_series_month(p_ref_month text)
RETURNS TABLE(
  client_id int,
  series_id uuid,
  label text,
  kind text,
  billing_type text,
  usage_driven boolean,
  billing_status text,
  billing_floor int,
  billing_base_value numeric,
  mode text,
  uso bigint,
  unit numeric,
  mrr_min numeric,
  mrr_real numeric,
  correction_index text,
  correction_percent numeric,
  correction_anniversary date,
  contract_renewal date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH v AS (
    SELECT (p_ref_month || '-01')::date AS first_day,
            ((p_ref_month || '-01')::date + interval '1 month')::date AS next_first
  ),
  usage_counts AS (
    SELECT cu.client_id,
           count(*) FILTER (WHERE (prof->>'ativo')::boolean)::bigint AS uso_lic
    FROM public.client_usage cu
    CROSS JOIN v
    CROSS JOIN LATERAL jsonb_array_elements(cu.profissionais_versao) AS prof
    WHERE cu.ref_month = p_ref_month
      AND cu.profissionais_versao IS NOT NULL
      AND coalesce(cu.pending, false) = false
    GROUP BY cu.client_id
  ),
  usage_os AS (
    SELECT cu.client_id,
           sum(coalesce((cu.donc_snapshot->>'totalOs')::bigint, cu.os_created, 0))::bigint AS uso_os
    FROM public.client_usage cu
    WHERE cu.ref_month = p_ref_month
      AND coalesce(cu.pending, false) = false
    GROUP BY cu.client_id
  ),
  reneg_months AS (
    SELECT DISTINCT s.client_id, rc.ref_month
    FROM public.contract_series s
    JOIN public.contract_charges rc ON rc.series_id = s.id AND rc.kind = 'recorrencia'
    WHERE s.kind = 'renegociacao'
      AND s.status = 'ativa'
  ),
  active_series AS (
    SELECT s.*, v.first_day, v.next_first
    FROM public.contract_series s
    CROSS JOIN v
    WHERE s.status = 'ativa'
      AND s.billing_start <= (v.next_first - 1)
      AND (s.billing_end IS NULL OR s.billing_end >= v.first_day)
  ),
  rules_any AS (
    SELECT DISTINCT r.series_id
    FROM public.contract_charges r
    WHERE r.kind = 'recorrencia'
  ),
  rules_month AS (
    SELECT rc.series_id,
            sum(
              CASE WHEN rc.mode = 'percent'
                THEN (CASE WHEN s.billing_floor > 0
                           THEN s.billing_base_value * s.billing_floor
                           ELSE s.billing_base_value END) * coalesce(rc.percent, 0) / 100
                ELSE coalesce(rc.amount, 0)
              END
            )::numeric AS total
    FROM public.contract_charges rc
    JOIN active_series s ON s.id = rc.series_id
    WHERE rc.kind = 'recorrencia'
      AND rc.ref_month = p_ref_month
    GROUP BY rc.series_id
  ),
  exc_series AS (
    SELECT e.series_id,
            bool_or(e.type = 'isencao_total') AS isento,
            max(e.percent) FILTER (WHERE e.type = 'desconto_percent') AS pct,
            max(e.reduced_value) FILTER (WHERE e.type = 'valor_reduzido') AS reduced,
            max(e.unit_discount) FILTER (WHERE e.type = 'desconto_unidade') AS unit_disc
    FROM public.billing_exceptions e
    WHERE e.series_id IS NOT NULL
      AND p_ref_month BETWEEN to_char(e.valid_from, 'YYYY-MM') AND to_char(e.valid_to, 'YYYY-MM')
    GROUP BY e.series_id
  ),
  tier_last AS (
    SELECT DISTINCT ON (t.series_id) t.series_id, t.limit_to, t.fixed_value, t.excess_unit_price
    FROM public.billing_os_tiers t
    ORDER BY t.series_id, t.tier_order DESC
  ),
  tier_first AS (
    SELECT DISTINCT ON (t.series_id) t.series_id, t.fixed_value
    FROM public.billing_os_tiers t
    ORDER BY t.series_id, t.tier_order ASC
  ),
  base AS (
    SELECT
      s.id AS series_id,
      s.client_id,
      s.label,
      s.kind,
      s.billing_type,
      s.usage_driven,
      s.billing_status,
      s.billing_floor,
      s.billing_base_value,
      s.correction_index,
      s.correction_percent,
      s.correction_anniversary,
      s.contract_renewal,
      s.first_day,
      (ra.series_id IS NOT NULL) AS has_rules,
      coalesce(rm.total, 0)::numeric AS rules_total,
      (CASE WHEN s.billing_floor > 0
             THEN s.billing_base_value * s.billing_floor
             ELSE s.billing_base_value END)::numeric AS base_total,
      greatest(s.billing_base_value - coalesce(exs.unit_disc, 0), 0)::numeric AS unit_eff,
      coalesce(uc.uso_lic, 0)::bigint AS uso_lic,
      coalesce(uo.uso_os, 0)::bigint AS uso_os,
      (s.kind = 'original' AND EXISTS (
         SELECT 1 FROM reneg_months rmn
         WHERE rmn.client_id = s.client_id AND rmn.ref_month = p_ref_month
       )) AS paused,
      coalesce(exs.isento, false) AS ex_isento,
      exs.pct AS ex_pct,
      exs.reduced AS ex_reduced,
      tl.limit_to AS last_limit,
      tl.fixed_value AS last_fixed,
      tl.excess_unit_price AS last_excess,
      tf.fixed_value AS tier1_fixed,
      (tl.series_id IS NOT NULL) AS has_tiers,
      (SELECT t.fixed_value
         FROM public.billing_os_tiers t
        WHERE t.series_id = s.id
          AND coalesce(uo.uso_os, 0) <= t.limit_to
        ORDER BY t.tier_order
        LIMIT 1) AS tier_fixed_cur,
      (s.billing_status = 'nao_bilhetavel'
        OR (s.billing_status = 'suspenso'
            AND coalesce(s.billing_suspended_until >= s.first_day, true))) AS zerada
    FROM active_series s
    LEFT JOIN rules_any ra ON ra.series_id = s.id
    LEFT JOIN rules_month rm ON rm.series_id = s.id
    LEFT JOIN usage_counts uc ON uc.client_id = s.client_id
    LEFT JOIN usage_os uo ON uo.client_id = s.client_id
    LEFT JOIN exc_series exs ON exs.series_id = s.id
    LEFT JOIN tier_last tl ON tl.series_id = s.id
    LEFT JOIN tier_first tf ON tf.series_id = s.id
  ),
  valued AS (
    SELECT b.*,
      (CASE WHEN b.usage_driven AND b.kind = 'original'
            THEN CASE WHEN b.billing_type = 'por_os' THEN b.uso_os ELSE b.uso_lic END
            ELSE 0 END)::bigint AS uso_app
    FROM base b
  ),
  computed AS (
    SELECT vd.*,
      CASE
        WHEN vd.paused OR vd.zerada THEN 0::numeric
        WHEN vd.usage_driven AND vd.billing_type = 'por_os' AND vd.has_tiers
          THEN coalesce(vd.tier1_fixed, vd.base_total)
        ELSE vd.rules_total
      END AS raw_min,
      CASE
        WHEN vd.paused OR vd.zerada THEN 0::numeric
        WHEN NOT vd.usage_driven THEN vd.rules_total
        WHEN vd.billing_type = 'por_os' AND vd.has_tiers
          THEN coalesce(
                 vd.tier_fixed_cur,
                 vd.last_fixed + greatest(vd.uso_app - vd.last_limit, 0) * vd.last_excess
               )
        ELSE vd.rules_total + greatest(vd.uso_app - vd.billing_floor, 0) * vd.unit_eff
      END AS raw_real
    FROM valued vd
  )
  SELECT
    c.client_id,
    c.series_id,
    c.label,
    c.kind,
    c.billing_type,
    c.usage_driven,
    c.billing_status,
    c.billing_floor,
    c.billing_base_value,
    CASE WHEN c.usage_driven THEN 'base_excedente' ELSE 'travado' END AS mode,
    c.uso_app AS uso,
    c.unit_eff AS unit,
    round(CASE WHEN c.ex_isento THEN 0
               WHEN c.ex_reduced IS NOT NULL THEN c.ex_reduced
               WHEN c.ex_pct IS NOT NULL THEN c.raw_min * (1 - c.ex_pct / 100)
               ELSE c.raw_min END, 4) AS mrr_min,
    round(CASE WHEN c.ex_isento THEN 0
               WHEN c.ex_reduced IS NOT NULL THEN c.ex_reduced
               WHEN c.ex_pct IS NOT NULL THEN c.raw_real * (1 - c.ex_pct / 100)
               ELSE c.raw_real END, 4) AS mrr_real,
    c.correction_index,
    c.correction_percent,
    c.correction_anniversary,
    c.contract_renewal
  FROM computed c
  -- Billed value only: Nao cobrar / suspenso / isento / paused never appear,
  -- even with launched periods. Anything else needs raw_min > 0 or raw_real > 0
  -- (a launched zero with excedente shows its value).
  WHERE NOT (c.raw_min = 0 AND c.raw_real = 0);
$$;
DROP FUNCTION IF EXISTS public.get_financeiro_cockpit(text);
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
    SELECT client_id FROM fin_cur
    UNION
    SELECT client_id FROM ev_cur
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
    fc.series_count,
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


REVOKE ALL ON FUNCTION public.get_financeiro_cockpit(text) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.get_financeiro_cockpit(text) TO authenticated;
