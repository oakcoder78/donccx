-- ============================================================================
-- Finance Cockpit — Pendências de adimplência
-- SDD: docs/sdd/financeiro-cockpit-sdd.md (adendo UI 2026-09-11)
--
-- Faturas de meses anteriores (1..N) sem status em billing_payments, com
-- vencimento derivado do dia da série. Read-only RPC for the cockpit block;
-- reuses the private engine `_financeiro_series_month`.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_financeiro_pendencias(p_months_back int DEFAULT 3)
RETURNS TABLE(
  client_id int,
  client_name text,
  series_id uuid,
  series_label text,
  ref_month text,
  due_date date,
  days_overdue int,
  mrr_real numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_months int := greatest(1, least(coalesce(p_months_back, 3), 12));
  v_offset int;
  v_ref text;
BEGIN
  IF coalesce(public.get_user_role(), '') NOT IN ('admin','manager','finance') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  FOR v_offset IN 1..v_months LOOP
    v_ref := to_char(date_trunc('month', current_date) - make_interval(months => v_offset), 'YYYY-MM');

    RETURN QUERY
    WITH s AS (
      SELECT * FROM public._financeiro_series_month(v_ref)
    ),
    due AS (
      SELECT
        s.*,
        least(
          ((v_ref || '-01')::date + (coalesce(cs.due_day, 5) - 1) * interval '1 day'),
          ((v_ref || '-01')::date + interval '1 month' - interval '1 day')
        )::date AS venc
      FROM s
      LEFT JOIN public.contract_series cs ON cs.id = s.series_id
    )
    SELECT
      c.id,
      coalesce(c.fantasy_name, c.name),
      d.series_id,
      d.label,
      v_ref,
      d.venc,
      greatest(current_date - d.venc, 0)::int,
      round(d.mrr_real, 2)
    FROM due d
    JOIN public.clients c ON c.id = d.client_id
    WHERE d.mrr_real > 0
      AND c.lifecycle_stage = 'cliente'
      AND NOT EXISTS (
        SELECT 1
        FROM public.billing_payments bp
        WHERE bp.client_id = d.client_id
          AND bp.series_id = d.series_id
          AND bp.ref_month = v_ref
      );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.get_financeiro_pendencias(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_financeiro_pendencias(int) TO authenticated;
