-- ============================================================================
-- Billing rebuild — Fase 4, passo 3: leituras de apoio aos fluxos de escrita
-- SDD: docs/sdd/financeiro-faturamento-sdd.md §4.2 a §4.7
--
-- 1. billing_cockpit_faturas passa a devolver series_id (a substituta de um
--    cancelamento e emitida pelo motor so para aquela serie).
-- 2. billing_cockpit_lancamentos: os lancamentos de uma fatura, com o que pode
--    ser estornado. Estorno de estorno e lancamento ja estornado por inteiro
--    nao sao estornaveis.
-- ============================================================================

DROP FUNCTION IF EXISTS public.billing_cockpit_faturas(integer, text);

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
    AND v.status = 'emitida'
  ORDER BY v.kind, v.due_date, v.installment_no NULLS FIRST, v.number;
END $$;

REVOKE ALL ON FUNCTION public.billing_cockpit_faturas(integer, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_cockpit_faturas(integer, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.billing_cockpit_lancamentos(p_invoice_id uuid)
RETURNS TABLE(
  entry_id     uuid,
  kind         text,
  amount       numeric,
  happened_at  date,
  method       text,
  reason       text,
  reverses_id  uuid,
  reversible   boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_read_billing() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT e.id, e.kind, e.amount, e.happened_at, e.method, e.reason, e.reverses_id,
         (e.kind IN ('pagamento','desconto','baixa')
          AND coalesce((SELECT sum(r.amount) FROM public.invoice_entries r WHERE r.reverses_id = e.id), 0) < e.amount)
  FROM public.invoice_entries e
  WHERE e.invoice_id = p_invoice_id
  ORDER BY e.happened_at, e.created_at;
END $$;

REVOKE ALL ON FUNCTION public.billing_cockpit_lancamentos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_cockpit_lancamentos(uuid) TO authenticated, service_role;
