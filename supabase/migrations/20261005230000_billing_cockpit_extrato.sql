-- ============================================================================
-- Fase 4: extrato da competencia de um cliente. Linha do tempo com a emissao
-- de cada fatura e cada lancamento, e o saldo devedor acumulado.
-- Sinal: emissao soma no saldo; pagamento, desconto e baixa reduzem; estorno
-- devolve o valor (soma), porque desfaz uma reducao.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.billing_cockpit_extrato(p_client_id integer, p_competencia text)
RETURNS TABLE(
  data             date,
  descricao        text,
  tipo             text,
  valor            numeric,
  saldo_acumulado  numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_read_billing() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN QUERY
  WITH linhas AS (
    SELECT i.issued_at::date AS dt,
           i.issued_at AS ts,
           0 AS ord,
           'emissao'::text AS tipo_linha,
           i.number || ' · ' || CASE WHEN i.kind = 'eventual' THEN 'eventual' ELSE 'recorrência' END AS descr,
           i.amount AS delta
    FROM public.invoices i
    WHERE i.client_id = p_client_id AND i.competencia = p_competencia AND i.status = 'emitida'
    UNION ALL
    SELECT e.happened_at,
           e.created_at,
           1,
           CASE WHEN e.reverses_id IS NOT NULL THEN 'estorno' ELSE e.kind END,
           i.number || ' · ' || CASE
             WHEN e.reverses_id IS NOT NULL THEN 'estorno'
             WHEN e.kind = 'pagamento' THEN 'pagamento ' || coalesce(e.method, '')
             WHEN e.kind = 'desconto' THEN 'desconto'
             WHEN e.kind = 'baixa' THEN 'baixa por perda'
             ELSE e.kind END,
           CASE WHEN e.kind IN ('pagamento', 'desconto', 'baixa') AND e.reverses_id IS NULL
                THEN -e.amount ELSE e.amount END
    FROM public.invoice_entries e
    JOIN public.invoices i ON i.id = e.invoice_id
    WHERE i.client_id = p_client_id AND i.competencia = p_competencia
  )
  SELECT l.dt,
         l.descr,
         l.tipo_linha,
         l.delta,
         sum(l.delta) OVER (ORDER BY l.dt, l.ord, l.ts) AS saldo
  FROM linhas l
  ORDER BY l.dt, l.ord, l.ts;
END $$;

REVOKE ALL ON FUNCTION public.billing_cockpit_extrato(integer, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_cockpit_extrato(integer, text) TO authenticated, service_role;
