-- ============================================================================
-- Fase 4: composicao da fatura (base + excedente), lida do registro do motor.
-- SDD §3.2 e §4.1. O motor grava base, excedente, uso, piso e valor unitario em
-- billing_run_log.detail, ligados a fatura pelo invoice_id. A fatura guarda so o
-- valor final; esta leitura devolve como ele foi composto.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.billing_cockpit_composicao(p_invoice_id uuid)
RETURNS TABLE(
  base       numeric,
  excedente  numeric,
  uso        bigint,
  piso       integer,
  unit       numeric,
  amount     numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_read_billing() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT (l.detail->>'base')::numeric,
         (l.detail->>'excedente')::numeric,
         (l.detail->>'uso')::bigint,
         (l.detail->>'piso')::integer,
         (l.detail->>'unit')::numeric,
         (l.detail->>'amount')::numeric
  FROM public.billing_run_log l
  WHERE l.invoice_id = p_invoice_id
    AND l.outcome = 'emitida'
    AND l.detail ? 'base'
  ORDER BY l.run_at DESC
  LIMIT 1;
END $$;

REVOKE ALL ON FUNCTION public.billing_cockpit_composicao(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_cockpit_composicao(uuid) TO authenticated, service_role;
