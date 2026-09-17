-- Finance cockpit: MRR required + anniversary backfill
-- 1) _financeiro_series_month excludes series with no billed value (base 0,
--    no rules) unless explicitly zeroed (paused/zerada/isencao_total).
--    Clients with no remaining series vanish from get_financeiro_cockpit/export.
-- 2) Backfill correction_anniversary = billing_start + 1 year where NULL.

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
           count(*) FILTER (WHERE (prof->>'ativo')::boolean)::bigint AS uso_lic,
           count(*) FILTER (
             WHERE (prof->>'dataUltimaOS') IS NOT NULL
               AND (prof->>'dataUltimaOS')::timestamptz >= v.first_day
               AND (prof->>'dataUltimaOS')::timestamptz < v.next_first
           )::bigint AS uso_os
    FROM public.client_usage cu
    CROSS JOIN v
    CROSS JOIN LATERAL jsonb_array_elements(cu.profissionais_versao) AS prof
    WHERE cu.ref_month = p_ref_month
      AND cu.profissionais_versao IS NOT NULL
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
      coalesce(uc.uso_os, 0)::bigint AS uso_os,
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
          AND coalesce(uc.uso_os, 0) <= t.limit_to
        ORDER BY t.tier_order
        LIMIT 1) AS tier_fixed_cur,
      (s.billing_status = 'nao_bilhetavel'
        OR (s.billing_status = 'suspenso'
            AND coalesce(s.billing_suspended_until >= s.first_day, true))) AS zerada
    FROM active_series s
    LEFT JOIN rules_any ra ON ra.series_id = s.id
    LEFT JOIN rules_month rm ON rm.series_id = s.id
    LEFT JOIN usage_counts uc ON uc.client_id = s.client_id
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
        WHEN vd.usage_driven THEN (vd.billing_floor * vd.unit_eff)::numeric
        WHEN vd.has_rules THEN vd.rules_total
        ELSE vd.base_total
      END AS raw_min,
      CASE
        WHEN vd.paused OR vd.zerada THEN 0::numeric
        WHEN NOT vd.usage_driven
          THEN (CASE WHEN vd.has_rules THEN vd.rules_total ELSE vd.base_total END)
        WHEN vd.billing_type = 'por_os' AND vd.has_tiers
          THEN coalesce(
                 vd.tier_fixed_cur,
                 vd.last_fixed + greatest(vd.uso_app - vd.last_limit, 0) * vd.last_excess
               )
        WHEN vd.billing_type = 'por_os'
          THEN greatest(vd.uso_app, vd.billing_floor) * vd.unit_eff
        WHEN vd.has_rules
          THEN vd.rules_total + greatest(vd.uso_app - vd.billing_floor, 0) * vd.unit_eff
        ELSE greatest(vd.uso_app, vd.billing_floor) * vd.unit_eff
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
  -- Only series with billed value (2026-09-17): sem MRR lançada, sem lançamento.
  -- Paused/zerada/isenta series (explicit zero) stay visible as R$ 0,00.
  WHERE NOT (
    c.raw_min = 0 AND c.raw_real = 0
    AND NOT c.paused AND NOT c.zerada AND NOT c.ex_isento
  );
$$;
UPDATE public.contract_series
   SET correction_anniversary = (billing_start + interval '1 year')::date
 WHERE correction_anniversary IS NULL
   AND billing_start IS NOT NULL;
