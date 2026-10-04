-- ============================================================================
-- Suite de verificacao — rebuild de faturamento, Fase 1 + hardening
-- SDD: docs/sdd/financeiro-faturamento-sdd.md §1.3, §1.4, §1.5, §1.12, §2.7,
--      §2.9, §2.10, §3.3, §3.6
--
-- Como rodar:
--   psql "$DATABASE_URL" -f supabase/tests/billing_rebuild_phase1.sql
--   ou pelo MCP execute_sql.
--
-- Tudo acontece numa transacao que termina em excecao de proposito, entao o
-- ROLLBACK e garantido mesmo se o chamador esquecer. Nao deixa residuo.
-- Usa competencias 2098-* e 2099-* para nao colidir com dado real.
--
-- A sequencia de numeracao NAO e transacional: cada rodada queima numeros de
-- fatura (o ROLLBACK nao devolve nextval). Isso e esperado e inofensivo
-- enquanto nenhuma fatura real existe; depois do go-live, a suite deixa um
-- buraco na numeracao, que e o comportamento normal de documento cancelado.
--
-- Resultado esperado: a mensagem final e "SUITE OK — N passed, 0 failed".
--
-- Historico: a primeira versao desta suite (commit 87a361d) tinha 10 checagens
-- e nao cobria a grade de datas, o discount_batch, a baixa por perda, a
-- validacao de metodo, o estorno cruzado, o pior atraso nem os privilegios de
-- tabela. As "66 assercoes" citadas no commit 1724e9e nunca foram versionadas;
-- esta suite e o artefato verificavel e agora cobre o que aquelas cobriam.
-- ============================================================================

DO $$
DECLARE
  v_user     uuid;
  v_client   integer;
  v_series   uuid;
  v_inv_a    uuid;
  v_inv_b    uuid;
  v_inv_c    uuid;
  v_entry    uuid;
  v_seq0     bigint;
  v_seq1     bigint;
  v_id2      uuid;
  v_bal      numeric;
  v_written  numeric;
  v_disc     numeric;
  v_sum_before numeric;
  v_sum_after  numeric;
  v_delay    integer;
  v_grid_bad integer;
  v_passed   integer := 0;
  v_failed   text := '';
  v_group    text;
BEGIN
  -- Papel de servico com um usuario real: cancelar e ajustar gravam auth.uid()
  -- na auditoria, e os CHECKs exigem esse valor.
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

  -- ==========================================================================
  -- 1. Emissao idempotente nao gasta numero de sequencia
  -- ==========================================================================
  v_inv_a := public.issue_invoice(v_client, v_series, 'recorrencia', '2099-01', 1000, '2099-01-10');
  SELECT last_value INTO v_seq0 FROM public.invoice_number_seq;
  v_id2 := public.issue_invoice(v_client, v_series, 'recorrencia', '2099-01', 1000, '2099-01-10');
  SELECT last_value INTO v_seq1 FROM public.invoice_number_seq;
  IF v_inv_a IS NOT NULL AND v_id2 IS NULL AND v_seq1 = v_seq0 THEN
    v_passed := v_passed + 1;
  ELSE
    v_failed := v_failed || E'\n  FAIL 1 emissao idempotente (id2=' || coalesce(v_id2::text,'null') || ', seq ' || v_seq0 || '->' || v_seq1 || ')';
  END IF;

  -- ==========================================================================
  -- 2. Pagamento parcial e saldo derivado
  -- ==========================================================================
  PERFORM public.settle_invoice(v_inv_a, 400, current_date, 'pix');
  SELECT balance INTO v_bal FROM public.invoice_balance WHERE id = v_inv_a;
  IF v_bal = 600 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 2 saldo parcial esperado 600, obtido ' || v_bal; END IF;

  -- ==========================================================================
  -- 3. Pagamento acima do saldo e recusado (sem credito)
  -- ==========================================================================
  BEGIN
    PERFORM public.settle_invoice(v_inv_a, 700, current_date, 'pix');
    v_failed := v_failed || E'\n  FAIL 3 overpay aceito';
  EXCEPTION WHEN SQLSTATE '22023' THEN v_passed := v_passed + 1; END;

  -- ==========================================================================
  -- 4. Metodo de pagamento e obrigatorio
  -- ==========================================================================
  BEGIN
    PERFORM public.settle_invoice(v_inv_a, 100, current_date, NULL);
    v_failed := v_failed || E'\n  FAIL 4 pagamento sem metodo aceito';
  EXCEPTION WHEN SQLSTATE '22023' THEN v_passed := v_passed + 1; END;

  -- ==========================================================================
  -- 5. Cancelar fatura com caixa registrado e recusado
  -- ==========================================================================
  BEGIN
    PERFORM public.cancel_invoice(v_inv_a, 'cancelamento de teste com pagamento');
    v_failed := v_failed || E'\n  FAIL 5 cancelamento com pagamento aceito';
  EXCEPTION WHEN SQLSTATE '22023' THEN v_passed := v_passed + 1; END;

  -- ==========================================================================
  -- 6. Estorno total libera o cancelamento; estorno acima do original e recusado
  -- ==========================================================================
  SELECT id INTO v_entry FROM public.invoice_entries
  WHERE invoice_id = v_inv_a AND kind = 'pagamento' LIMIT 1;
  PERFORM public.reverse_entry(v_entry, 'estorno de teste para liberar cancelamento');
  BEGIN
    PERFORM public.reverse_entry(v_entry, 'segundo estorno deve falhar aqui');
    v_failed := v_failed || E'\n  FAIL 6 estorno acima do original aceito';
  EXCEPTION WHEN SQLSTATE '22023' THEN v_passed := v_passed + 1; END;

  BEGIN
    PERFORM public.cancel_invoice(v_inv_a, 'cancelamento apos estorno total');
    v_passed := v_passed + 1;
  EXCEPTION WHEN OTHERS THEN
    v_failed := v_failed || E'\n  FAIL 6b cancelamento apos estorno recusado: ' || SQLERRM; END;

  -- ==========================================================================
  -- 7. Ajuste para zero e recusado (zero nao existe; use cancelamento)
  -- ==========================================================================
  v_inv_b := public.issue_invoice(v_client, v_series, 'eventual', '2099-02', 500, '2099-02-10',
                                  'teste', gen_random_uuid(), 1::smallint, 1::smallint);
  BEGIN
    PERFORM public.adjust_invoice(v_inv_b, 0, 'ajuste para zero deve falhar');
    v_failed := v_failed || E'\n  FAIL 7 ajuste para zero aceito';
  EXCEPTION WHEN SQLSTATE '22023' THEN v_passed := v_passed + 1; END;

  -- ==========================================================================
  -- 8. Recorrencia sem serie e recusada pelo CHECK
  -- ==========================================================================
  BEGIN
    PERFORM public.issue_invoice(v_client, NULL, 'recorrencia', '2099-03', 300, '2099-03-10');
    v_failed := v_failed || E'\n  FAIL 8 recorrencia sem serie aceita';
  EXCEPTION WHEN check_violation THEN v_passed := v_passed + 1; END;

  -- ==========================================================================
  -- 9. A view respeita a RLS de quem consulta (security_invoker ligado)
  -- ==========================================================================
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'invoice_balance' AND relnamespace = 'public'::regnamespace
      AND reloptions @> ARRAY['security_invoker=true']
  ) THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 9 invoice_balance sem security_invoker'; END IF;

  -- ==========================================================================
  -- 10. Funcoes de saldo e numeracao nao sao executaveis por authenticated
  -- ==========================================================================
  IF NOT has_function_privilege('authenticated', 'public.assert_invoice_open(uuid,numeric,text)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.invoice_state(uuid)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.generate_invoice_number(int)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.refresh_client_delay_days(integer)', 'EXECUTE') THEN
    v_passed := v_passed + 1;
  ELSE
    v_failed := v_failed || E'\n  FAIL 10 funcao sensivel executavel por authenticated';
  END IF;

  -- ==========================================================================
  -- 11. Tabelas RPC-only: authenticated sem INSERT/UPDATE/DELETE
  -- ==========================================================================
  IF NOT has_table_privilege('authenticated', 'public.invoices', 'INSERT')
     AND NOT has_table_privilege('authenticated', 'public.invoices', 'UPDATE')
     AND NOT has_table_privilege('authenticated', 'public.invoices', 'DELETE')
     AND NOT has_table_privilege('authenticated', 'public.invoice_entries', 'INSERT')
     AND NOT has_table_privilege('authenticated', 'public.invoice_entries', 'UPDATE')
     AND NOT has_table_privilege('authenticated', 'public.invoice_entries', 'DELETE')
     AND NOT has_table_privilege('authenticated', 'public.billing_run_log', 'INSERT')
     AND has_table_privilege('authenticated', 'public.invoices', 'SELECT') THEN
    v_passed := v_passed + 1;
  ELSE
    v_failed := v_failed || E'\n  FAIL 11 authenticated com escrita direta em tabela RPC-only';
  END IF;

  -- ==========================================================================
  -- 12. Sequencia protegida: authenticated nao pode queimar numero
  -- ==========================================================================
  IF NOT has_sequence_privilege('authenticated', 'public.invoice_number_seq', 'USAGE')
     AND has_sequence_privilege('service_role', 'public.invoice_number_seq', 'USAGE') THEN
    v_passed := v_passed + 1;
  ELSE
    v_failed := v_failed || E'\n  FAIL 12 sequencia acessivel por authenticated';
  END IF;

  -- ==========================================================================
  -- 13. Grade de datas — o clamp nao pode perder o dia
  -- ==========================================================================
  SELECT count(*) INTO v_grid_bad FROM (VALUES
    ('2026-06-30', 1,  '2026-06-30'),
    ('2026-06-30', 2,  '2026-07-30'),
    ('2026-06-30', 8,  '2027-01-30'),
    ('2026-06-30', 12, '2027-05-30'),
    ('2024-01-31', 2,  '2024-02-29'),   -- bissexto
    ('2025-01-31', 2,  '2025-02-28'),   -- comum
    ('2026-01-31', 4,  '2026-04-30'),   -- mes de 30
    ('2024-01-31', 14, '2025-02-28'),   -- +13m = fev/25
    ('2024-01-31', 15, '2025-03-31'),   -- +14m = mar/25, volta o 31
    ('2026-08-31', 6,  '2027-01-31'),
    ('2026-08-31', 7,  '2027-02-28'),
    ('2026-08-31', 8,  '2027-03-31'),
    ('2024-02-29', 13, '2025-02-28'),   -- ancora bissexta em fev comum
    ('2024-12-31', 2,  '2025-01-31'),   -- virada de ano
    ('2024-12-31', 3,  '2025-02-28')
  ) g(first_due, idx, esperado)
  WHERE public.billing_due_date(first_due::date, idx) <> esperado::date;
  IF v_grid_bad = 0 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 13 grade de datas: ' || v_grid_bad || ' de 15 erradas'; END IF;

  -- ==========================================================================
  -- 14. Estorno entre faturas e recusado
  -- ==========================================================================
  v_inv_c := public.issue_invoice(v_client, v_series, 'eventual', '2099-04', 900, '2099-04-10',
                                  'teste cruzado', gen_random_uuid(), 1::smallint, 1::smallint);
  v_entry := public.settle_invoice(v_inv_c, 300, current_date, 'boleto');
  BEGIN
    INSERT INTO public.invoice_entries (invoice_id, kind, amount, happened_at, reason, reverses_id)
    VALUES (v_inv_b, 'estorno', 100, current_date, 'estorno cruzado de teste', v_entry);
    v_failed := v_failed || E'\n  FAIL 14 estorno entre faturas aceito';
  EXCEPTION WHEN SQLSTATE '23514' THEN v_passed := v_passed + 1; END;

  -- ==========================================================================
  -- 15. Baixa por perda e separada de desconto
  -- ==========================================================================
  PERFORM public.write_off_invoice(v_inv_c, 200, 'cliente encerrou as atividades');
  SELECT written_off, discounted INTO v_written, v_disc
  FROM public.invoice_balance WHERE id = v_inv_c;
  IF v_written = 200 AND v_disc = 0 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 15 baixa: written_off=' || v_written || ' discounted=' || v_disc; END IF;

  -- ==========================================================================
  -- 16. discount_batch: total aplicado e nenhum saldo negativo
  -- ==========================================================================
  SELECT coalesce(sum(balance), 0) INTO v_sum_before
  FROM public.invoice_balance WHERE id IN (v_inv_b, v_inv_c);
  v_disc := public.discount_batch(array[v_inv_b, v_inv_c], 400, 'acordo de divida com o cliente');
  SELECT coalesce(sum(balance), 0) INTO v_sum_after
  FROM public.invoice_balance WHERE id IN (v_inv_b, v_inv_c);
  IF v_disc = 400
     AND abs(v_sum_after - (v_sum_before - 400)) < 0.01
     AND NOT EXISTS (SELECT 1 FROM public.invoice_balance WHERE id IN (v_inv_b, v_inv_c) AND balance < 0) THEN
    v_passed := v_passed + 1;
  ELSE
    v_failed := v_failed || E'\n  FAIL 16 lote: aplicado=' || v_disc || ' soma ' || v_sum_before || '->' || v_sum_after;
  END IF;

  -- ==========================================================================
  -- 17. Pior atraso, nao o mais recente
  -- ==========================================================================
  PERFORM public.issue_invoice(v_client, v_series, 'recorrencia', '2098-01', 100, current_date - 200);
  PERFORM public.issue_invoice(v_client, v_series, 'recorrencia', '2098-02', 100, current_date - 30);
  SELECT delay_days INTO v_delay FROM public.clients WHERE id = v_client;
  IF v_delay >= 200 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 17 pior atraso: esperado >= 200, obtido ' || v_delay; END IF;

  -- ==========================================================================
  -- 18. Nenhum cliente com atraso negativo (sanidade do writer)
  -- ==========================================================================
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE delay_days < 0) THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 18 delay_days negativo encontrado'; END IF;

  -- Saida: levanta excecao para forcar o ROLLBACK e mostrar o resultado.
  IF v_failed = '' THEN
    RAISE EXCEPTION 'SUITE OK — % passed, 0 failed (transacao revertida)', v_passed;
  ELSE
    RAISE EXCEPTION 'SUITE FALHOU — % passed%', v_passed, v_failed;
  END IF;
END $$;
