-- ============================================================================
-- Fase 4: billing_cockpit_motivos devolve o tipo da linha (recorrencia ou
-- eventual), para a tela explicar de onde vem a projecao.
-- ============================================================================

DROP FUNCTION IF EXISTS public.billing_cockpit_motivos(text);

CREATE OR REPLACE FUNCTION public.billing_cockpit_motivos(p_competencia text)
RETURNS TABLE(
  client_id   integer,
  series_id   uuid,
  kind        text,
  outcome     text,
  reason      text,
  amount      numeric
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_read_billing() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF NOT public.can_write_billing() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.client_id, p.series_id, p.kind, p.outcome, p.reason, p.amount
  FROM public.close_competencia(p_competencia, 'preview', false, NULL) p
  WHERE p.series_id IS NOT NULL;
END $$;

REVOKE ALL ON FUNCTION public.billing_cockpit_motivos(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_cockpit_motivos(text) TO authenticated, service_role;
