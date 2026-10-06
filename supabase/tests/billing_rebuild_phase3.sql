-- ============================================================================
-- Suite de verificacao — rebuild de faturamento, Fase 3 (ciclo de vida)
-- SDD: docs/sdd/financeiro-faturamento-sdd.md §5.7, §6 Fase 3
-- Lifecycle SDD: docs/sdd/contract-series-lifecycle-sdd.md §4-ter
--
-- Como rodar: psql "$DATABASE_URL" -f supabase/tests/billing_rebuild_phase3.sql
--             ou pelo MCP execute_sql.
-- Tudo numa transacao que termina em excecao: o ROLLBACK e garantido.
--
-- O teste que importa e o ultimo: encerrar e reabrir o cliente 21 REAL e
-- conferir que o modelo antigo (61 charges, 48 payments) fica intacto. Antes da
-- Fase 3, encerrar apagava linhas de contract_charges; agora nao toca nelas.
--
-- Resultado esperado: "SUITE OK — N passed, 0 failed".
-- ============================================================================

DO $$
DECLARE
  v_user    uuid;
  v_tc      integer;
  v_ts      uuid;
  v_inv     uuid;
  v_inv2    uuid;
  v_pay     uuid;
  v_res     jsonb;
  v_row     record;
  v_txt     text;
  v_n       integer;
  v_before  integer;
  v_after   integer;
  -- cliente 21
  v_c21     integer := 21;
  v_s21     uuid;
  v_charges_antes integer;
  v_pays_antes    integer;
  v_charges_depois integer;
  v_pays_depois    integer;
  v_passed  integer := 0;
  v_failed  text := '';
BEGIN
  SELECT id INTO v_user FROM public.profiles WHERE role = 'admin' ORDER BY id LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'suite: nenhum perfil admin'; END IF;
  -- Simula meses consolidados pelo cron (so nesta transacao, revertida no final):
  -- a barreira recusa leitura e escrita de competencia nao consolidada.
  INSERT INTO public.sync_service_log (ref_month, service_name, triggered_by, status, started_at, finished_at)
  SELECT to_char(m, 'YYYY-MM'), 'donc-api', 'cron', 'success', m + interval '1 month', m + interval '1 month' + interval '1 second'
  FROM generate_series(date '2026-01-01', date '2100-12-01', interval '1 month') m;

  PERFORM set_config('request.jwt.claims',

    json_build_object('role','service_role','sub',v_user)::text, true);

  -- ==========================================================================
  -- Fixture: cliente descartavel com regra e faturas
  -- ==========================================================================
  INSERT INTO public.clients (name, lifecycle_stage) VALUES ('ZZ Teste Fase 3', 'cliente')
  RETURNING id INTO v_tc;

  INSERT INTO public.contract_series
    (client_id, kind, label, billing_start, due_day, billing_type, billing_base_value, billing_floor,
     usage_driven, first_competencia, first_due_date, contract_months, auto_renew)
  VALUES (v_tc, 'original', 'ZZ contrato', '2026-06-30', 30, 'fixo', 1000, 0, false, '2026-06', '2026-06-30', 36, true)
  RETURNING id INTO v_ts;
  INSERT INTO public.series_rules (series_id, month_from, month_to, mode, amount)
  VALUES (v_ts, 1, NULL, 'amount', 1000);

  -- Fatura futura nao liquidada (deve ser cancelada no encerramento)
  v_inv := public.issue_invoice(v_tc, v_ts, 'recorrencia', '2026-12', 1000, '2026-12-30');

  -- ==========================================================================
  -- 1. Encerrar: status, renewal, motivo
  -- ==========================================================================
  v_res := public.encerrar_series(v_ts, true, NULL, 'cliente pediu o encerramento do contrato', false);
  SELECT status, contract_renewal, encerramento_motivo, contract_months
    INTO v_row FROM public.contract_series WHERE id = v_ts;
  IF v_row.status = 'encerrada' AND v_row.contract_renewal IS NULL
     AND v_row.encerramento_motivo = 'cliente pediu o encerramento do contrato'
     AND v_row.contract_months = 36
  THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 1 encerrar: status=' || coalesce(v_row.status,'null')
    || ' renewal=' || coalesce(v_row.contract_renewal::text,'null')
    || ' motivo=' || coalesce(v_row.encerramento_motivo,'null')
    || ' months=' || coalesce(v_row.contract_months::text,'null'); END IF;

  -- ==========================================================================
  -- 2. Encerrar cancela a fatura futura NAO liquidada
  -- ==========================================================================
  SELECT status INTO v_row FROM public.invoices WHERE id = v_inv;
  IF v_row.status = 'cancelada' THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 2 fatura futura nao cancelada: ' || coalesce(v_row.status,'null'); END IF;

  -- ==========================================================================
  -- 3. Encerrar NAO cancela fatura com lancamento (pagamento e fato)
  -- ==========================================================================
  v_res := public.reabrir_series(v_ts);
  v_inv2 := public.issue_invoice(v_tc, v_ts, 'recorrencia', '2027-01', 1000, '2027-01-30');
  v_pay := public.settle_invoice(v_inv2, 300, current_date, 'pix');
  v_res := public.encerrar_series(v_ts, true, NULL, 'encerrando com fatura paga parcialmente', false);
  SELECT status INTO v_row FROM public.invoices WHERE id = v_inv2;
  IF v_row.status = 'emitida' THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 3 fatura com pagamento foi cancelada'; END IF;

  -- ==========================================================================
  -- 4. Reabrir devolve status e renewal; nada e emitido retroativamente
  -- ==========================================================================
  v_res := public.reabrir_series(v_ts);
  SELECT status, contract_renewal, encerramento_motivo, contract_months
    INTO v_row FROM public.contract_series WHERE id = v_ts;
  IF v_row.status = 'ativa' AND v_row.encerramento_motivo IS NULL
     AND v_row.contract_renewal = (SELECT (billing_start + make_interval(months => 36))::date
                                   FROM public.contract_series WHERE id = v_ts)
     AND v_row.contract_months = 36
  THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 4 reabrir: status=' || coalesce(v_row.status,'null')
    || ' renewal=' || coalesce(v_row.contract_renewal::text,'null')
    || ' motivo=' || coalesce(v_row.encerramento_motivo,'null'); END IF;

  -- ==========================================================================
  -- 5. Encerrar e idempotente
  -- ==========================================================================
  v_res := public.encerrar_series(v_ts, true, NULL, 'primeiro encerramento do teste', false);
  v_res := public.encerrar_series(v_ts, true, NULL, 'segundo encerramento do teste', false);
  IF (v_res->>'ja_encerrada')::boolean IS TRUE THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 5 encerrar nao e idempotente'; END IF;
  v_res := public.reabrir_series(v_ts);

  -- ==========================================================================
  -- 6. Eventual de encerramento vira fatura
  -- ==========================================================================
  SELECT count(*) INTO v_before FROM public.invoices WHERE series_id = v_ts AND kind = 'eventual';
  v_res := public.encerrar_series(v_ts, false,
    jsonb_build_object('amount', 5000, 'label', 'Multa de rescisao', 'reason', 'cliente rescindiu antes do prazo'),
    'encerramento com multa de rescisao', false);
  SELECT count(*) INTO v_after FROM public.invoices WHERE series_id = v_ts AND kind = 'eventual';
  IF v_after = v_before + 1 AND (v_res->>'eventual_id') IS NOT NULL THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 6 eventual de encerramento nao virou fatura'; END IF;
  v_res := public.reabrir_series(v_ts);

  -- ==========================================================================
  -- 7. Motivo curto e recusado; eventual com valor zero e recusado
  -- ==========================================================================
  BEGIN
    PERFORM public.encerrar_series(v_ts, false, NULL, 'curto', false);
    v_failed := v_failed || E'\n  FAIL 7a motivo curto aceito';
  EXCEPTION WHEN SQLSTATE '22023' THEN v_passed := v_passed + 1; END;

  BEGIN
    PERFORM public.encerrar_series(v_ts, false, jsonb_build_object('amount', 0), 'motivo longo o suficiente', false);
    v_failed := v_failed || E'\n  FAIL 7b eventual de valor zero aceito';
  EXCEPTION WHEN SQLSTATE '22023' THEN v_passed := v_passed + 1; END;

  -- ==========================================================================
  -- 8. Reabrir sem regra e recusado
  -- ==========================================================================
  DELETE FROM public.series_rules WHERE series_id = v_ts;   -- serie sem regra nenhuma
  UPDATE public.contract_series SET status = 'encerrada' WHERE id = v_ts;
  BEGIN
    PERFORM public.reabrir_series(v_ts);
    v_failed := v_failed || E'\n  FAIL 8 reabrir sem regra aceito';
  EXCEPTION WHEN SQLSTATE '23514' THEN v_passed := v_passed + 1; END;
  INSERT INTO public.series_rules (series_id, month_from, month_to, mode, amount)
  VALUES (v_ts, 1, NULL, 'amount', 1000);
  UPDATE public.contract_series SET status = 'ativa' WHERE id = v_ts;

  -- ==========================================================================
  -- 9. cobrar_mais_meses: estende a janela e desliga a renovacao
  -- ==========================================================================
  v_res := public.cobrar_mais_meses(v_ts, 12);
  SELECT auto_renew, billing_end INTO v_row FROM public.contract_series WHERE id = v_ts;
  IF v_row.auto_renew = false AND v_row.billing_end IS NOT NULL
     AND (v_res->>'billing_end')::date = v_row.billing_end
  THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 9 cobrar_mais_meses: auto_renew=' || coalesce(v_row.auto_renew::text,'null')
    || ' billing_end=' || coalesce(v_row.billing_end::text,'null'); END IF;

  -- ==========================================================================
  -- 10. A janela estendida muda a emissao: mes dentro passa, fora para
  -- ==========================================================================
  -- billing_end e o ultimo dia de (current + 12 meses). A competencia de
  -- current+12 esta dentro; current+13 esta fora.
  UPDATE public.series_rules SET month_to = NULL WHERE series_id = v_ts;
  SELECT outcome || '/' || reason INTO v_txt
  FROM public.close_competencia(to_char((date_trunc('month', current_date) + interval '13 months')::date, 'YYYY-MM'), 'preview')
  WHERE series_id = v_ts;
  IF v_txt = 'pulada/fora_janela' THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 10 janela: ' || coalesce(v_txt,'(null)'); END IF;

  -- ==========================================================================
  -- 11. get_series_vencidas le invoices e nao quebra
  -- ==========================================================================
  SELECT count(*) INTO v_n FROM public.get_series_vencidas();
  IF v_n >= 0 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 11 get_series_vencidas'; END IF;

  -- ==========================================================================
  -- 12. REGRESSAO — cliente 21 real: encerrar/reabrir nao toca o modelo antigo
  -- ==========================================================================
  SELECT id INTO v_s21 FROM public.contract_series WHERE client_id = v_c21 LIMIT 1;
  -- Regra sintetica so para o reopen nao recusar por falta de recorrencia; o
  -- que o teste mede e o modelo ANTIGO, que nao pode ser tocado.
  INSERT INTO public.series_rules (series_id, month_from, month_to, mode, amount)
  VALUES (v_s21, 1, NULL, 'amount', 2299.95);

  SELECT count(*) INTO v_charges_antes FROM public.contract_charges WHERE series_id = v_s21;
  SELECT count(*) INTO v_pays_antes    FROM public.billing_payments WHERE series_id = v_s21;

  v_res := public.encerrar_series(v_s21, true, NULL, 'teste de regressao do cliente 21', false);
  v_res := public.reabrir_series(v_s21);

  SELECT count(*) INTO v_charges_depois FROM public.contract_charges WHERE series_id = v_s21;
  SELECT count(*) INTO v_pays_depois    FROM public.billing_payments WHERE series_id = v_s21;

  IF v_charges_antes = 61 AND v_pays_antes = 48
     AND v_charges_depois = 61 AND v_pays_depois = 48
  THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 12 regressao cliente 21: charges '
    || v_charges_antes || '->' || v_charges_depois
    || ', payments ' || v_pays_antes || '->' || v_pays_depois; END IF;

  -- E o estado da serie 21 voltou ao que era
  SELECT status, contract_renewal, contract_months INTO v_row
  FROM public.contract_series WHERE id = v_s21;
  IF v_row.status = 'ativa' AND v_row.contract_renewal = '2025-10-27' AND v_row.contract_months = 36
  THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 13 cliente 21 apos reabrir: status=' || coalesce(v_row.status,'null')
    || ' renewal=' || coalesce(v_row.contract_renewal::text,'null')
    || ' months=' || coalesce(v_row.contract_months::text,'null'); END IF;

  -- ==========================================================================
  -- 14-18. Escolha explicita no encerramento: a regra vem da negociacao
  -- ==========================================================================
  PERFORM set_config('request.jwt.claims', json_build_object('role','service_role','sub',v_user)::text, true);

  -- 14. Padrao (os dois flags false) nao cancela nada
  UPDATE public.contract_series SET status = 'ativa' WHERE id = v_ts;
  v_inv := public.issue_invoice(v_tc, v_ts, 'eventual', '2099-08', 300, '2099-08-10',
                                'parcela padrao', gen_random_uuid(), 1::smallint, 2::smallint);
  v_res := public.encerrar_series(v_ts, false, NULL, 'sem cancelamento nesta sonda', false, false);
  SELECT status INTO v_txt FROM public.invoices WHERE id = v_inv;
  IF v_txt = 'emitida' THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 14 eventual cancelado sem escolha: ' || coalesce(v_txt,'null'); END IF;

  -- 15. So o eventual: a recorrencia futura fica
  UPDATE public.contract_series SET status = 'ativa' WHERE id = v_ts;
  v_inv := public.issue_invoice(v_tc, v_ts, 'eventual', '2099-08', 310, '2099-08-10',
                                'parcela so eventual', gen_random_uuid(), 1::smallint, 2::smallint);
  v_inv2 := public.issue_invoice(v_tc, v_ts, 'recorrencia', '2099-09', 100, '2099-09-10');
  v_res := public.encerrar_series(v_ts, false, NULL, 'so o eventual sai nesta sonda', false, true);
  IF (SELECT status FROM public.invoices WHERE id = v_inv) = 'cancelada'
     AND (SELECT status FROM public.invoices WHERE id = v_inv2) = 'emitida' THEN
    v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 15 so-eventual: eventual=' || coalesce((SELECT status FROM public.invoices WHERE id = v_inv),'null')
    || ' recorrencia=' || coalesce((SELECT status FROM public.invoices WHERE id = v_inv2),'null'); END IF;

  -- 16. Os dois: recorrencia e eventual cancelados
  UPDATE public.contract_series SET status = 'ativa' WHERE id = v_ts;
  v_inv := public.issue_invoice(v_tc, v_ts, 'eventual', '2099-10', 320, '2099-10-10',
                                'parcela dos dois', gen_random_uuid(), 1::smallint, 2::smallint);
  v_inv2 := public.issue_invoice(v_tc, v_ts, 'recorrencia', '2099-10', 110, '2099-10-10');
  v_res := public.encerrar_series(v_ts, true, NULL, 'cancelar os dois nesta sonda', false, true);
  IF (SELECT status FROM public.invoices WHERE id = v_inv) = 'cancelada'
     AND (SELECT status FROM public.invoices WHERE id = v_inv2) = 'cancelada' THEN
    v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 16 os-dois nao cancelou ambos'; END IF;

  -- 17. cancelar_eventual_grupo cancela as parcelas nao pagas e preserva a paga
  v_pay := gen_random_uuid();  -- grupo proprio deste teste
  UPDATE public.contract_series SET status = 'ativa' WHERE id = v_ts;
  v_inv := public.issue_invoice(v_tc, v_ts, 'eventual', '2099-11', 500, '2099-11-10',
                                'grupo teste', v_pay, 1::smallint, 2::smallint);
  v_inv2 := public.issue_invoice(v_tc, v_ts, 'eventual', '2099-12', 500, '2099-12-10',
                                 'grupo teste', v_pay, 2::smallint, 2::smallint);
  PERFORM public.settle_invoice(v_inv, 500, current_date, 'pix');
  v_res := public.cancelar_eventual_grupo(v_pay, 'cancelamento de teste do grupo');
  IF (v_res->>'parcelas_canceladas')::int = 1
     AND (SELECT status FROM public.invoices WHERE id = v_inv) = 'emitida'
     AND (SELECT status FROM public.invoices WHERE id = v_inv2) = 'cancelada' THEN
    v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 17 cancelar_eventual_grupo: ' || coalesce(v_res::text,'null'); END IF;

  -- 18. Papel fora da lista nao encerra, mesmo com a serie ja encerrada
  IF EXISTS (SELECT 1 FROM public.profiles WHERE role NOT IN ('admin','manager','finance','sales')) THEN
    UPDATE public.contract_series SET status = 'encerrada' WHERE id = v_ts;
    PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',
      (SELECT id FROM public.profiles WHERE role NOT IN ('admin','manager','finance','sales') ORDER BY id LIMIT 1))::text, true);
    BEGIN
      v_res := public.encerrar_series(v_ts, false, NULL, 'sonda de papel sem permissao', false, false);
      v_failed := v_failed || E'\n  FAIL 18 papel sem permissao recebeu ' || v_res::text;
    EXCEPTION WHEN SQLSTATE '42501' THEN
      v_passed := v_passed + 1;
    END;
  ELSE
    v_failed := v_failed || E'\n  FAIL 18 sem perfil fora dos papeis para o teste';
  END IF;

  -- ==========================================================================
  -- 19-20. sales cancela pelo ciclo de vida, mas nao cancela avulso
  -- ==========================================================================
  PERFORM set_config('request.jwt.claims', json_build_object('role','service_role','sub',v_user)::text, true);
  IF EXISTS (SELECT 1 FROM public.profiles WHERE role = 'sales') THEN
    v_pay := (SELECT id FROM public.profiles WHERE role = 'sales' ORDER BY id LIMIT 1);
    UPDATE public.contract_series SET status = 'ativa' WHERE id = v_ts;
    v_inv := public.issue_invoice(v_tc, v_ts, 'eventual', '2099-03', 410, '2099-03-10',
                                  'parcela sales', gen_random_uuid(), 1::smallint, 2::smallint);
    v_inv2 := public.issue_invoice(v_tc, v_ts, 'recorrencia', '2099-03', 120, '2099-03-10');
    PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',v_pay)::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      v_res := public.encerrar_series(v_ts, true, NULL, 'sales encerrando com os dois', false, true);
      IF (SELECT status FROM public.invoices WHERE id = v_inv) = 'cancelada'
         AND (SELECT status FROM public.invoices WHERE id = v_inv2) = 'cancelada' THEN
        v_passed := v_passed + 1;
      ELSE v_failed := v_failed || E'\n  FAIL 19 sales nao cancelou os dois pelo encerramento'; END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed || E'\n  FAIL 19 sales: ' || SQLERRM;
    END;
    RESET ROLE;

    -- 20. cancel_invoice avulso continua so para financeiro
    PERFORM set_config('request.jwt.claims', json_build_object('role','service_role','sub',v_user)::text, true);
    UPDATE public.contract_series SET status = 'ativa' WHERE id = v_ts;
    v_inv := public.issue_invoice(v_tc, v_ts, 'eventual', '2099-04', 415, '2099-04-10',
                                  'avulso sales', gen_random_uuid(), 1::smallint, 2::smallint);
    PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',v_pay)::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      PERFORM public.cancel_invoice(v_inv, 'cancelamento avulso por sales');
      v_failed := v_failed || E'\n  FAIL 20 sales cancelou fatura avulsa';
    EXCEPTION WHEN SQLSTATE '42501' THEN
      v_passed := v_passed + 1;
    END;
    RESET ROLE;
  ELSE
    v_failed := v_failed || E'\n  FAIL 19 sem perfil sales para o teste';
  END IF;

  IF coalesce(v_failed, '') = '' THEN
    RAISE EXCEPTION 'SUITE OK — % passed, 0 failed (transacao revertida)', v_passed;
  ELSE
    RAISE EXCEPTION 'SUITE FALHOU — % passed%', v_passed, coalesce(v_failed,'(mensagem nula)');
  END IF;
END $$;
