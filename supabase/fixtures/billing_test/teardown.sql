-- ============================================================================
-- Teardown do fixture de teste do cockpit (Fase 4).
-- Apaga so o que pertence aos clientes "[TESTE] ..." (Alfa, Beta, Gama). Nao
-- apaga resumos de fechamento sem serie (billing_run_log.series_id IS NULL): sao
-- auditoria de acoes reais. Depois mostra a linha de base.
--
-- Rodar: supabase db query --linked -f supabase/fixtures/billing_test/teardown.sql
-- ============================================================================

DO $$
DECLARE
  v_clientes integer[];
  v_series   uuid[];
  v_faturas  uuid[];
BEGIN
  SELECT coalesce(array_agg(id), '{}') INTO v_clientes FROM public.clients WHERE name LIKE '[TESTE] %';
  SELECT coalesce(array_agg(id), '{}') INTO v_series FROM public.contract_series WHERE client_id = ANY (v_clientes);
  SELECT coalesce(array_agg(id), '{}') INTO v_faturas FROM public.invoices WHERE client_id = ANY (v_clientes);

  DELETE FROM public.invoice_entries WHERE invoice_id = ANY (v_faturas);
  DELETE FROM public.billing_run_log WHERE series_id = ANY (v_series);
  DELETE FROM public.invoices WHERE client_id = ANY (v_clientes);
  DELETE FROM public.series_eventuals WHERE series_id = ANY (v_series);
  DELETE FROM public.series_rules WHERE series_id = ANY (v_series);
  DELETE FROM public.contract_series WHERE client_id = ANY (v_clientes);
  DELETE FROM public.client_usage WHERE client_id = ANY (v_clientes);
  DELETE FROM public.clients WHERE id = ANY (v_clientes);

  RAISE NOTICE 'teardown: % clientes, % series, % faturas removidos', cardinality(v_clientes), cardinality(v_series), cardinality(v_faturas);
END $$;

-- Linha de base, mostrada depois da limpeza
SELECT
  (SELECT count(*) FROM public.contract_charges)  AS charges,
  (SELECT count(*) FROM public.billing_payments)  AS payments,
  (SELECT count(*) FROM public.invoices)          AS faturas,
  (SELECT count(*) FROM public.invoice_entries)   AS lancamentos,
  (SELECT count(*) FROM public.series_rules)      AS regras,
  (SELECT count(*) FROM public.billing_run_log)   AS run_log,
  (SELECT count(*) FROM public.contract_series WHERE status = 'encerrada') AS encerradas,
  (SELECT count(*) FROM public.clients WHERE name LIKE '[TESTE] %') AS clientes_teste;
