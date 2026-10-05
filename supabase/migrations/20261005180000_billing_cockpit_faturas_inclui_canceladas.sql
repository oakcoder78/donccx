-- ============================================================================
-- Fase 4: billing_cockpit_faturas passa a devolver tambem as faturas canceladas.
-- SDD §4.1: a fatura cancelada aparece com o estado "cancelada", nao some.
-- A contagem M (emitidas) continua em billing_cockpit_clientes, que nao muda.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.billing_cockpit_faturas(p_client_id integer, p_competencia text)
RETURNS TABLE(
  invoice_id         uuid,
  series_id          uuid,
  number             text,
  kind               text,
  description        text,
  amount             numeric,
  due_date           date,
  paid               numeric,
  balance            numeric,
  state              text,
  overdue_days       integer,
  last_settlement    date,
  installment_no     smallint,
  installments_total smallint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_read_billing() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT v.id, v.series_id, v.number, v.kind, v.description, v.amount, v.due_date,
         v.paid, v.balance, v.state, v.overdue_days, v.last_settlement,
         v.installment_no, v.installments_total
  FROM public.invoice_balance v
  WHERE v.client_id = p_client_id
    AND v.competencia = p_competencia
  ORDER BY v.status = 'cancelada', v.kind, v.due_date, v.installment_no NULLS FIRST, v.number;
END $$;

REVOKE ALL ON FUNCTION public.billing_cockpit_faturas(integer, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_cockpit_faturas(integer, text) TO authenticated, service_role;
