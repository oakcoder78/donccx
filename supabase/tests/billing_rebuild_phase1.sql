-- ============================================================================
-- Suite de verificacao — rebuild de faturamento, Fase 1 (+ hardening)
-- SDD: docs/sdd/financeiro-faturamento-sdd.md §1.3, §1.5, §1.12, §2.7, §2.10
--
-- Como rodar: psql "$DATABASE_URL" -f supabase/tests/billing_rebuild_phase1.sql
-- Ou pelo MCP execute_sql. Tudo acontece dentro de uma transacao que termina em
-- ROLLBACK (o bloco final levanta excecao de proposito), entao nao deixa
-- residuo. Requer ao menos um cliente em public.clients.
--
-- Resultado esperado: a ultima linha de saida e "N passed, 0 failed".
-- ============================================================================

DO $$
DECLARE
  v_user    uuid;
  v_client  integer;
  v_series  uuid;
  v_inv_a   uuid;
  v_inv_b   uuid;
  v_entry   uuid;
  v_seq0    bigint;
  v_seq1    bigint;
  v_id2     uuid;
  v_bal     numeric;
  v_passed  integer := 0;
  v_failed  text := '';
  v_sqlstate text;
BEGIN
  -- Papel de servico (aceito pelas RPCs) com um usuario real: cancelar e
  -- ajustar gravam auth.uid() na auditoria, e os CHECKs exigem esse valor.
  SELECT id INTO v_user FROM public.profiles ORDER BY id LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'suite: nenhum perfil disponivel para auditoria';
  END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'service_role', 'sub', v_user)::text, true);

  SELECT id INTO v_client FROM public.clients ORDER BY id LIMIT 1;
  SELECT id INTO v_series FROM public.contract_series ORDER BY id LIMIT 1;
  IF v_client IS NULL THEN
    RAISE EXCEPTION 'suite: nenhum cliente disponivel para o fixture';
  END IF;

  -- 1. Emissao idempotente nao gasta numero de sequencia
  v_inv_a := public.issue_invoice(v_client, v_series, 'recorrencia', '2099-01', 1000, '2099-01-10');
  SELECT last_value INTO v_seq0 FROM public.invoice_number_seq;
  v_id2 := public.issue_invoice(v_client, v_series, 'recorrencia', '2099-01', 1000, '2099-01-10');
  SELECT last_value INTO v_seq1 FROM public.invoice_number_seq;
  IF v_inv_a IS NOT NULL AND v_id2 IS NULL AND v_seq1 = v_seq0 THEN
    v_passed := v_passed + 1;
  ELSE
    v_failed := v_failed || E'\n  FAIL 1 emissao idempotente nao gasta numero (id2=' || coalesce(v_id2::text,'null') || ', seq ' || v_seq0 || '->' || v_seq1 || ')';
  END IF;

  -- 2. Pagamento parcial e saldo derivado
  PERFORM public.settle_invoice(v_inv_a, 400, current_date, 'pix');
  SELECT balance INTO v_bal FROM public.invoice_balance WHERE id = v_inv_a;
  IF v_bal = 600 THEN
    v_passed := v_passed + 1;
  ELSE
    v_failed := v_failed || E'\n  FAIL 2 saldo apos pagamento parcial esperado 600, obtido ' || v_bal;
  END IF;

  -- 3. Pagamento acima do saldo e recusado (sem credito)
  BEGIN
    PERFORM public.settle_invoice(v_inv_a, 700, current_date, 'pix');
    v_failed := v_failed || E'\n  FAIL 3 overpay aceito';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_passed := v_passed + 1;
  END;

  -- 4. Cancelar fatura com caixa registrado e recusado
  BEGIN
    PERFORM public.cancel_invoice(v_inv_a, 'cancelamento de teste com pagamento');
    v_failed := v_failed || E'\n  FAIL 4 cancelamento com pagamento aceito';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_passed := v_passed + 1;
  END;

  -- 5. Estorno total libera o cancelamento; estorno acima do original e recusado
  SELECT id INTO v_entry FROM public.invoice_entries
  WHERE invoice_id = v_inv_a AND kind = 'pagamento' LIMIT 1;
  PERFORM public.reverse_entry(v_entry, 'estorno de teste para liberar cancelamento');
  BEGIN
    PERFORM public.reverse_entry(v_entry, 'segundo estorno deve falhar aqui');
    v_failed := v_failed || E'\n  FAIL 5 estorno acima do original aceito';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_passed := v_passed + 1;
  END;

  BEGIN
    PERFORM public.cancel_invoice(v_inv_a, 'cancelamento apos estorno total');
    v_passed := v_passed + 1;
  EXCEPTION WHEN OTHERS THEN
    v_failed := v_failed || E'\n  FAIL 5b cancelamento apos estorno total recusado: ' || SQLERRM;
  END;

  -- 6. Ajuste para zero e recusado (zero nao existe; use cancelamento)
  v_inv_b := public.issue_invoice(v_client, v_series, 'eventual', '2099-02', 500, '2099-02-10',
                                  'teste', gen_random_uuid(), 1::smallint, 1::smallint);
  BEGIN
    PERFORM public.adjust_invoice(v_inv_b, 0, 'ajuste para zero deve falhar');
    v_failed := v_failed || E'\n  FAIL 6 ajuste para zero aceito';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_passed := v_passed + 1;
  END;

  -- 7. Recorrencia sem serie e recusada pelo CHECK
  BEGIN
    PERFORM public.issue_invoice(v_client, NULL, 'recorrencia', '2099-03', 300, '2099-03-10');
    v_failed := v_failed || E'\n  FAIL 7 recorrencia sem serie aceita';
  EXCEPTION WHEN check_violation THEN
    v_passed := v_passed + 1;
  END;

  -- 8. Visao respeita RLS de quem consulta (security_invoker ligado)
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'invoice_balance' AND relnamespace = 'public'::regnamespace
      AND reloptions @> ARRAY['security_invoker=true']
  ) THEN
    v_passed := v_passed + 1;
  ELSE
    v_failed := v_failed || E'\n  FAIL 8 invoice_balance sem security_invoker';
  END IF;

  -- 9. Funcoes de saldo e numeracao nao sao executaveis por authenticated
  IF NOT has_function_privilege('authenticated', 'public.assert_invoice_open(uuid,numeric,text)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.invoice_state(uuid)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.generate_invoice_number(int)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.refresh_client_delay_days(integer)', 'EXECUTE') THEN
    v_passed := v_passed + 1;
  ELSE
    v_failed := v_failed || E'\n  FAIL 9 funcao sensivel executavel por authenticated';
  END IF;

  -- Saida: levanta excecao para forcar o ROLLBACK e mostrar o resultado.
  IF v_failed = '' THEN
    RAISE EXCEPTION 'SUITE OK — % passed, 0 failed (transacao revertida)', v_passed;
  ELSE
    RAISE EXCEPTION 'SUITE FALHOU — % passed%', v_passed, v_failed;
  END IF;
END $$;
