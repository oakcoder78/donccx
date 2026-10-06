-- ============================================================================
-- Competencias que a tela pode mostrar: so as consolidadas pelo cron do mes
-- seguinte. O mes corrente nunca aparece antes da sincronizacao.
-- Mesma regra de billing_competencia_consolidada (migration 20261005280000).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.billing_competencias_consolidadas()
RETURNS SETOF text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_read_billing() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  RETURN QUERY
  SELECT DISTINCT l.ref_month
  FROM public.sync_service_log l
  WHERE l.triggered_by = 'cron'
    AND l.status = 'success'
    AND l.ref_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    AND l.started_at >= ((l.ref_month || '-01')::date + interval '1 month' - interval '1 day')
  ORDER BY 1 DESC
  LIMIT 24;
END $$;

REVOKE ALL ON FUNCTION public.billing_competencias_consolidadas() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_competencias_consolidadas() TO authenticated, service_role;
