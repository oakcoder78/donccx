-- ============================================================================
-- Finance Cockpit — Phase 1 core
-- SDD: docs/sdd/financeiro-cockpit-sdd.md v0.3 (rules validated 2026-09-11)
--
-- 1) contract_series: billing mode (usage_driven) + annual adjustment metadata
-- 2) billing_exceptions: hybrid client/series scope, 4 types, RLS
-- 3) feature flag cockpit_financeiro (disabled)
-- 4) _financeiro_series_month (private engine) + get_financeiro_cockpit /
--    get_financeiro_detalhe / get_financeiro_export
--
-- Business invariants:
--   - A series is a billing sheet; usage applies only to the ORIGINAL series.
--   - Annual adjustment is carried by the series value (renewal with corrected
--     value). No correction math, no retroactivity.
--   - Exceptions apply series scope first, then client scope, to min AND real.
--   - One invoice per (client, series, ref_month) — billing_payments exists.
--   - Eventuais (kind='implantacao') are NOT part of MRR (ledger only).
-- ============================================================================

-- ============================================================================
-- 1) contract_series — billing mode + annual adjustment metadata
-- ============================================================================
ALTER TABLE public.contract_series
  ADD COLUMN IF NOT EXISTS usage_driven boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS correction_anniversary date,
  ADD COLUMN IF NOT EXISTS correction_percent numeric,
  ADD COLUMN IF NOT EXISTS correction_rule text;

ALTER TABLE public.contract_series
  DROP CONSTRAINT IF EXISTS contract_series_correction_percent_check;
ALTER TABLE public.contract_series
  ADD CONSTRAINT contract_series_correction_percent_check
  CHECK (correction_percent IS NULL OR (correction_percent > 0 AND correction_percent <= 50));

ALTER TABLE public.contract_series
  DROP CONSTRAINT IF EXISTS contract_series_correction_rule_check;
ALTER TABLE public.contract_series
  ADD CONSTRAINT contract_series_correction_rule_check
  CHECK (correction_rule IS NULL OR correction_rule IN ('percentual', 'indice', 'maior'));

COMMENT ON COLUMN public.contract_series.usage_driven IS
  'true = billing by usage (usage above floor forms the MRR); false = value locked to the series';
COMMENT ON COLUMN public.contract_series.correction_anniversary IS
  'Annual adjustment anniversary; app default = contract_signed_date; configurable per series';
COMMENT ON COLUMN public.contract_series.correction_percent IS
  'Annual adjustment percentage (editable: fixed X%, index or the greater). Applied by the renewal, no retroactivity';
COMMENT ON COLUMN public.contract_series.correction_rule IS
  'Contract rule for the annual adjustment: percentual (fixed) | indice (IPCA/IGP-M) | maior';

-- Backfill: the original contract keeps the BRD behavior (excedent billing)
UPDATE public.contract_series
   SET usage_driven = (kind = 'original')
 WHERE kind = 'original'
   AND usage_driven = false;

-- ============================================================================
-- 2) billing_exceptions — hybrid client/series, 4 types
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.billing_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id int NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  series_id uuid NULL REFERENCES public.contract_series(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('isencao_total','desconto_percent','valor_reduzido','desconto_unidade')),
  percent numeric NULL CHECK (percent IS NULL OR (percent > 0 AND percent <= 100)),
  reduced_value numeric NULL CHECK (reduced_value IS NULL OR reduced_value > 0),
  unit_discount numeric NULL CHECK (unit_discount IS NULL OR unit_discount > 0),
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  reason text NOT NULL,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz,
  CONSTRAINT billing_exceptions_vigencia_check CHECK (valid_to >= valid_from),
  CONSTRAINT billing_exceptions_reason_check CHECK (char_length(reason) >= 10),
  CONSTRAINT billing_exceptions_type_fields_check CHECK (
    (type = 'desconto_percent' AND percent IS NOT NULL AND reduced_value IS NULL AND unit_discount IS NULL)
    OR (type = 'valor_reduzido' AND reduced_value IS NOT NULL AND percent IS NULL AND unit_discount IS NULL)
    OR (type = 'desconto_unidade' AND unit_discount IS NOT NULL AND percent IS NULL AND reduced_value IS NULL)
    OR (type = 'isencao_total' AND percent IS NULL AND reduced_value IS NULL AND unit_discount IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_billing_exceptions_client ON public.billing_exceptions(client_id);
CREATE INDEX IF NOT EXISTS idx_billing_exceptions_series ON public.billing_exceptions(series_id);
CREATE INDEX IF NOT EXISTS idx_billing_exceptions_vigencia ON public.billing_exceptions(valid_from, valid_to);

DROP TRIGGER IF EXISTS trg_billing_exceptions_updated_at ON public.billing_exceptions;
CREATE TRIGGER trg_billing_exceptions_updated_at
  BEFORE UPDATE ON public.billing_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.billing_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_exceptions_select ON public.billing_exceptions;
CREATE POLICY billing_exceptions_select ON public.billing_exceptions
  FOR SELECT USING (public.get_user_role() IN ('admin','manager','finance','sales'));

DROP POLICY IF EXISTS billing_exceptions_write ON public.billing_exceptions;
CREATE POLICY billing_exceptions_write ON public.billing_exceptions
  FOR ALL USING (public.get_user_role() IN ('admin','finance'))
  WITH CHECK (public.get_user_role() IN ('admin','finance'));

REVOKE ALL ON TABLE public.billing_exceptions FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.billing_exceptions TO authenticated;

-- ============================================================================
-- 3) Feature flag (disabled until Phase 5 QA)
-- ============================================================================
INSERT INTO public.feature_flags (key, description, enabled, allowed_roles, updated_at)
VALUES (
  'cockpit_financeiro',
  'Cockpit Financeiro — MRR real, excedente, exceções e adimplência',
  false,
  ARRAY['admin','manager','finance'],
  now()
)
ON CONFLICT (key) DO UPDATE
  SET allowed_roles = ARRAY['admin','manager','finance'],
      updated_at = now();

-- ============================================================================
-- 4) Private engine — evaluated series rows for one ref_month
--    Usage applies only to the original series (usage_driven).
--    Exceptions here are SERIES-scope only; client-scope is applied by callers.
-- ============================================================================
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
  FROM computed c;
$$;

REVOKE ALL ON FUNCTION public._financeiro_series_month(text) FROM public, anon, authenticated;

-- ============================================================================
-- 5) get_financeiro_cockpit(p_ref_month) — per-client rows for the table/KPIs
-- ============================================================================
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
           count(*) FILTER (WHERE (prof->>'ativo')::boolean)::bigint AS uso_lic,
           count(*) FILTER (
             WHERE (prof->>'dataUltimaOS') IS NOT NULL
               AND (prof->>'dataUltimaOS')::timestamptz >= v_first
               AND (prof->>'dataUltimaOS')::timestamptz < (v_first + interval '1 month')
           )::bigint AS uso_os
    FROM public.client_usage cu
    CROSS JOIN LATERAL jsonb_array_elements(cu.profissionais_versao) AS prof
    WHERE cu.ref_month = p_ref_month
      AND cu.profissionais_versao IS NOT NULL
      AND coalesce(cu.pending, false) = false
    GROUP BY cu.client_id
  ),
  usage_prv AS (
    SELECT cu.client_id,
           count(*) FILTER (WHERE (prof->>'ativo')::boolean)::bigint AS uso_lic,
           count(*) FILTER (
             WHERE (prof->>'dataUltimaOS') IS NOT NULL
               AND (prof->>'dataUltimaOS')::timestamptz >= (v_first - interval '1 month')
               AND (prof->>'dataUltimaOS')::timestamptz < v_first
           )::bigint AS uso_os
    FROM public.client_usage cu
    CROSS JOIN LATERAL jsonb_array_elements(cu.profissionais_versao) AS prof
    WHERE cu.ref_month = v_prev
      AND cu.profissionais_versao IS NOT NULL
      AND coalesce(cu.pending, false) = false
    GROUP BY cu.client_id
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
    CASE WHEN m.billing_type = 'por_os' THEN coalesce(uc.uso_os, 0) ELSE coalesce(uc.uso_lic, 0) END,
    CASE WHEN m.billing_type = 'por_os' THEN coalesce(up.uso_os, 0) ELSE coalesce(up.uso_lic, 0) END,
    CASE WHEN m.billing_type = 'por_os' THEN coalesce(uc.uso_os, 0)
         ELSE greatest(coalesce(uc.uso_lic, 0), coalesce(m.billing_floor, cl.billing_floor, 0)) END,
    coalesce(vl.unit, cl.billing_base_value, 0),
    fc.correction_index,
    fc.correction_percent,
    round(fc.mrr_min, 2),
    round(fc.mrr_real, 2),
    round(fc.mrr_real - fc.mrr_min, 2),
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
         THEN round((fc.mrr_real - fp.mrr_real) / fp.mrr_real * 100, 1)
         ELSE NULL END,
    fc.contract_renewal,
    fc.correction_anniversary
  FROM fin_cur fc
  JOIN public.clients cl ON cl.id = fc.client_id
  LEFT JOIN meta_cur m ON m.client_id = fc.client_id
  LEFT JOIN usage_cur uc ON uc.client_id = fc.client_id
  LEFT JOIN usage_prv up ON up.client_id = fc.client_id
  LEFT JOIN valu vl ON vl.client_id = fc.client_id
  LEFT JOIN exc_any ea ON ea.client_id = fc.client_id
  LEFT JOIN pay p ON p.client_id = fc.client_id
  LEFT JOIN fin_prv fp ON fp.client_id = fc.client_id
  WHERE cl.lifecycle_stage = 'cliente'
  ORDER BY cl.fantasy_name, cl.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_financeiro_cockpit(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_financeiro_cockpit(text) TO authenticated;

-- ============================================================================
-- 6) get_financeiro_detalhe(p_client_id, p_ref_month) — lazy accordion payload
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

-- ============================================================================
-- 7) get_financeiro_export(p_ref_month) — analytic rows (client × series)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_financeiro_export(p_ref_month text)
RETURNS TABLE(
  client_id int,
  client_name text,
  cnpj text,
  saas_id text,
  series_id uuid,
  series_label text,
  series_kind text,
  billing_type text,
  mode text,
  billing_floor int,
  uso bigint,
  billable bigint,
  valor_unit numeric,
  mrr_min numeric,
  mrr_real numeric,
  excedente numeric,
  excecao_desc text,
  excecao_escopo text,
  payment_status text,
  delay_days int,
  paid_at date,
  correction_index text,
  correction_percent numeric,
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
  WITH s AS (
    SELECT * FROM public._financeiro_series_month(p_ref_month)
  ),
  exc AS (
    SELECT e.client_id, e.series_id, e.type, e.percent, e.unit_discount,
           row_number() OVER (
             PARTITION BY e.client_id, (e.series_id IS NULL)
             ORDER BY e.created_at DESC
           ) AS rn
    FROM public.billing_exceptions e
    WHERE p_ref_month BETWEEN to_char(e.valid_from, 'YYYY-MM') AND to_char(e.valid_to, 'YYYY-MM')
  ),
  exc_series AS (
    SELECT DISTINCT ON (x.client_id, x.series_id) x.client_id, x.series_id, x.type, x.percent, x.unit_discount
    FROM exc x
    WHERE x.series_id IS NOT NULL
    ORDER BY x.client_id, x.series_id, x.rn
  ),
  exc_client AS (
    SELECT DISTINCT ON (x.client_id) x.client_id, x.type, x.percent, x.unit_discount
    FROM exc x
    WHERE x.series_id IS NULL
    ORDER BY x.client_id, x.rn
  )
  SELECT
    cl.id,
    coalesce(cl.fantasy_name, cl.name),
    cl.cnpj,
    (SELECT string_agg(DISTINCT di.contrato_saas_id::text, ', ')
       FROM public.client_donc_instances di
      WHERE di.client_id = cl.id
        AND coalesce(di.active, true)),
    s.series_id,
    s.label,
    s.kind,
    s.billing_type,
    s.mode,
    s.billing_floor,
    s.uso,
    CASE WHEN s.billing_type = 'por_os' THEN s.uso
         ELSE greatest(s.uso, s.billing_floor) END,
    s.unit,
    round(s.mrr_min, 2),
    round(s.mrr_real, 2),
    round(greatest(s.mrr_real - s.mrr_min, 0), 2),
    CASE coalesce(es.type, ec.type)
      WHEN 'isencao_total' THEN 'Isento'
      WHEN 'desconto_percent' THEN 'Desconto ' || trim(to_char(coalesce(es.percent, ec.percent), 'FM999D99')) || '%'
      WHEN 'valor_reduzido' THEN 'Valor reduzido'
      WHEN 'desconto_unidade' THEN 'Desconto ' || trim(to_char(coalesce(es.unit_discount, ec.unit_discount), 'FM999D99')) || '/un.'
      ELSE NULL
    END,
    CASE WHEN es.type IS NOT NULL THEN 'serie'
         WHEN ec.type IS NOT NULL THEN 'cliente'
         ELSE NULL END,
    bp.status,
    coalesce(bp.delay_days, 0),
    bp.paid_at,
    s.correction_index,
    s.correction_percent,
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
     WHERE cu.client_id = s.client_id
       AND cu.ref_month = p_ref_month
       AND cu.profissionais_versao IS NOT NULL
       AND coalesce(cu.pending, false) = false)
  FROM s
  JOIN public.clients cl ON cl.id = s.client_id
  LEFT JOIN exc_series es ON es.client_id = s.client_id AND es.series_id = s.series_id
  LEFT JOIN exc_client ec ON ec.client_id = s.client_id
  LEFT JOIN public.billing_payments bp
         ON bp.client_id = s.client_id
        AND bp.series_id = s.series_id
        AND bp.ref_month = p_ref_month
  WHERE cl.lifecycle_stage = 'cliente'
  ORDER BY cl.fantasy_name, cl.name, s.kind, s.label;
END;
$$;

REVOKE ALL ON FUNCTION public.get_financeiro_export(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_financeiro_export(text) TO authenticated;
