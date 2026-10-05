-- ============================================================================
-- Suite de verificacao — rebuild de faturamento, Fase 2 (motor de emissao)
-- SDD: docs/sdd/financeiro-faturamento-sdd.md §3.1-§3.5, §4.2, §5.6, §6 Fase 2
--
-- Como rodar:
--   psql "$DATABASE_URL" -f supabase/tests/billing_rebuild_phase2.sql
--   ou pelo MCP execute_sql.
--
-- Tudo numa transacao que termina em excecao de proposito: o ROLLBACK e
-- garantido e nao deixa residuo. Cria faixas sinteticas em series reais para
-- exercitar o calculo com o uso real da base, e um cliente descartavel para as
-- regras de janela.
--
-- Resultado esperado: "SUITE OK — N passed, 0 failed".
-- ============================================================================

DO $$
DECLARE
  v_user      uuid;
  v_c18       integer;
  v_c20       integer;
  v_c21       integer;
  v_s18       uuid;
  v_s20       uuid;
  v_s21       uuid;
  v_extra     uuid;
  v_tc        integer;
  v_ts        uuid;
  v_ts2       uuid;
  v_row       record;
  v_txt       text;
  v_amt       numeric;
  v_n         integer;
  v_sid       uuid;
  v_prev      numeric;
  v_eng       numeric;
  v_passed    integer := 0;
  v_failed    text := '';
  v_parity_bad text := '';
BEGIN
  SELECT id INTO v_user FROM public.profiles ORDER BY id LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'suite: nenhum perfil disponivel'; END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'service_role', 'sub', v_user)::text, true);

  -- ==========================================================================
  -- Fixture: faixas para as series reais com uso conhecido em 2026-09
  -- ==========================================================================
  SELECT id INTO v_c18 FROM public.clients WHERE id = 18;
  SELECT id INTO v_c20 FROM public.clients WHERE id = 20;
  SELECT id INTO v_c21 FROM public.clients WHERE id = 21;
  SELECT id INTO v_s18 FROM public.contract_series WHERE client_id = 18 LIMIT 1;
  SELECT id INTO v_s20 FROM public.contract_series WHERE client_id = 20 LIMIT 1;
  SELECT id INTO v_s21 FROM public.contract_series WHERE client_id = 21 LIMIT 1;
  IF v_s18 IS NULL OR v_s20 IS NULL OR v_s21 IS NULL THEN
    RAISE EXCEPTION 'suite: series 18/20/21 nao encontradas';
  END IF;

  -- Faixa aberta a partir do mes 1 cobrindo tudo, no valor do piso de cada uma.
  INSERT INTO public.series_rules (series_id, month_from, month_to, mode, amount) VALUES
    (v_s18, 1, NULL, 'amount', (SELECT billing_base_value * billing_floor FROM public.contract_series WHERE id = v_s18)),
    (v_s20, 1, NULL, 'amount', 0),
    (v_s21, 1, NULL, 'amount', (SELECT billing_base_value * billing_floor FROM public.contract_series WHERE id = v_s21));

  -- ==========================================================================
  -- 1. Licenca com piso, uso acima: unit x uso  (Center Kennedy: 51 x 59.90)
  -- ==========================================================================
  SELECT amount INTO v_amt FROM public.close_competencia('2026-09','preview')
  WHERE series_id = v_s18;
  IF v_amt = 3054.90 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 1 licenca com piso, uso acima: ' || v_amt || ' (esperado 3054.90)'; END IF;

  -- ==========================================================================
  -- 2. Licenca com piso, uso abaixo: unit x piso  (Eletromoveis: 29 < 45)
  -- ==========================================================================
  SELECT amount INTO v_amt FROM public.close_competencia('2026-09','preview')
  WHERE series_id = v_s21;
  IF v_amt = 2299.95 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 2 licenca com piso, uso abaixo: ' || v_amt || ' (esperado 2299.95)'; END IF;

  -- ==========================================================================
  -- 3. Por OS sem piso: unit x os  (Todimo: 3441 x 1.93)
  -- ==========================================================================
  SELECT amount INTO v_amt FROM public.close_competencia('2026-09','preview')
  WHERE series_id = v_s20;
  IF v_amt = 6641.13 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 3 OS sem piso: ' || v_amt || ' (esperado 6641.13)'; END IF;

  -- ==========================================================================
  -- 4. Dois modulos: cada serie cobra o MESMO uso, com sua propria unit
  -- ==========================================================================
  -- Segunda serie para o cliente 18: unit 20, mesmo piso 50. Com uso 51:
  -- serie 1 = 59.90 x 51 = 3054.90; serie 2 = 20 x 51 = 1020.00.
  INSERT INTO public.contract_series
    (client_id, kind, label, billing_start, due_day, billing_type, billing_base_value, billing_floor,
     usage_driven, first_competencia, first_due_date)
  VALUES
    (v_c18, 'aditivo', 'ZZ Modulo extra', '2026-06-30', 30, 'por_licenca', 20, 50, true, '2026-06', '2026-06-30')
  RETURNING id INTO v_extra;
  INSERT INTO public.series_rules (series_id, month_from, month_to, mode, amount)
  VALUES (v_extra, 1, NULL, 'amount', 1000);

  SELECT amount INTO v_amt FROM public.close_competencia('2026-09','preview') WHERE series_id = v_extra;
  IF v_amt = 1020.00 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 4 segundo modulo: ' || v_amt || ' (esperado 1020.00)'; END IF;

  SELECT sum(amount) INTO v_prev FROM public.close_competencia('2026-09','preview')
  WHERE client_id = v_c18;
  IF v_prev = 4074.90 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 4b total do cliente com dois modulos: ' || v_prev || ' (esperado 4074.90)'; END IF;

  -- ==========================================================================
  -- 5. Modo travado (usage_driven=false): ignora o uso, usa a faixa
  -- ==========================================================================
  UPDATE public.contract_series SET usage_driven = false WHERE id = v_extra;
  SELECT amount INTO v_amt FROM public.close_competencia('2026-09','preview') WHERE series_id = v_extra;
  IF v_amt = 1000.00 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 5 travado: ' || v_amt || ' (esperado 1000.00)'; END IF;
  UPDATE public.contract_series SET usage_driven = true WHERE id = v_extra;

  -- ==========================================================================
  -- 6. Valor fixo (billing_type='fixo'): usa a faixa, sem uso
  -- ==========================================================================
  UPDATE public.contract_series SET billing_type = 'fixo' WHERE id = v_extra;
  SELECT amount INTO v_amt FROM public.close_competencia('2026-09','preview') WHERE series_id = v_extra;
  IF v_amt = 1000.00 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 6 fixo: ' || v_amt || ' (esperado 1000.00)'; END IF;
  UPDATE public.contract_series SET billing_type = 'por_licenca' WHERE id = v_extra;

  -- ==========================================================================
  -- 7. Modo percent: percentual sobre unit x piso
  -- ==========================================================================
  -- 50% de (59.90 x 50) = 1497.50; com uso 51 o excedente continua entrando.
  UPDATE public.series_rules SET mode = 'percent', amount = NULL, percent = 50 WHERE series_id = v_s18;
  SELECT amount INTO v_amt FROM public.close_competencia('2026-09','preview') WHERE series_id = v_s18;
  -- base 1497.50 + excedente (51-50)*59.90 = 59.90 -> 1557.40
  IF v_amt = 1557.40 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 7 percent: ' || v_amt || ' (esperado 1557.40)'; END IF;
  UPDATE public.series_rules SET mode = 'amount', percent = NULL,
         amount = (SELECT billing_base_value * billing_floor FROM public.contract_series WHERE id = v_s18)
  WHERE series_id = v_s18;

  -- ==========================================================================
  -- 8-12. Regra de parada (§3.4) — cliente descartavel com series sinteticas
  -- ==========================================================================
  INSERT INTO public.clients (name, lifecycle_stage) VALUES ('ZZ Teste Fase 2', 'cliente')
  RETURNING id INTO v_tc;

  -- 8. billing_end no passado -> fora_janela
  INSERT INTO public.contract_series
    (client_id, kind, label, billing_start, due_day, billing_type, billing_base_value, billing_floor,
     usage_driven, first_competencia, first_due_date, billing_end, auto_renew)
  VALUES (v_tc, 'original', 'ZZ fim definido', '2024-01-15', 15, 'fixo', 100, 0, false, '2024-01', '2024-01-15', '2026-08-31', true)
  RETURNING id INTO v_ts;
  INSERT INTO public.series_rules (series_id, month_from, month_to, mode, amount) VALUES (v_ts, 1, NULL, 'amount', 100);
  SELECT outcome || '/' || reason INTO v_txt FROM public.close_competencia('2026-09','preview') WHERE series_id = v_ts;
  IF v_txt = 'pulada/fora_janela' THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 8 billing_end no passado: ' || coalesce(v_txt,'(null)'); END IF;

  -- 9. contract_months + auto_renew=false, alem do prazo -> fora_janela
  --    first_competencia 2024-01, 12 meses -> ate 2024-12. 2026-09 esta fora.
  UPDATE public.contract_series SET billing_end = NULL, contract_months = 12, auto_renew = false WHERE id = v_ts;
  SELECT outcome || '/' || reason INTO v_txt FROM public.close_competencia('2026-09','preview') WHERE series_id = v_ts;
  IF v_txt = 'pulada/fora_janela' THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 9 prazo vencido sem renovacao: ' || coalesce(v_txt,'(null)'); END IF;

  -- 10. contract_months + auto_renew=false, dentro do prazo -> emite
  --     2024-01 + 35 = 2026-12, entao 2026-09 (mes 33) esta dentro de 36.
  UPDATE public.contract_series SET contract_months = 36 WHERE id = v_ts;
  SELECT outcome INTO v_txt FROM public.close_competencia('2026-09','preview') WHERE series_id = v_ts;
  IF v_txt = 'emitiria' THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 10 dentro do prazo: ' || coalesce(v_txt,'(null)'); END IF;

  -- 11. contract_months + auto_renew=true, alem do prazo -> emite
  UPDATE public.contract_series SET auto_renew = true WHERE id = v_ts;
  SELECT outcome INTO v_txt FROM public.close_competencia('2027-06','preview') WHERE series_id = v_ts;
  IF v_txt = 'emitiria' THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 11 renovacao automatica: ' || coalesce(v_txt,'(null)'); END IF;

  -- 12. contract_months NULL + auto_renew=false -> segue enquanto ativa
  UPDATE public.contract_series SET contract_months = NULL, auto_renew = false WHERE id = v_ts;
  SELECT outcome INTO v_txt FROM public.close_competencia('2027-06','preview') WHERE series_id = v_ts;
  IF v_txt = 'emitiria' THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 12 sem prazo declarado: ' || coalesce(v_txt,'(null)'); END IF;

  -- ==========================================================================
  -- 13. Sem regra -> pulada/sem_regra
  -- ==========================================================================
  INSERT INTO public.contract_series
    (client_id, kind, label, billing_start, due_day, billing_type, billing_base_value, billing_floor,
     usage_driven, first_competencia, first_due_date)
  VALUES (v_tc, 'aditivo', 'ZZ sem regra', '2024-01-15', 15, 'fixo', 100, 0, false, '2024-01', '2024-01-15')
  RETURNING id INTO v_ts2;
  SELECT outcome || '/' || reason INTO v_txt FROM public.close_competencia('2026-09','preview') WHERE series_id = v_ts2;
  IF v_txt = 'pulada/sem_regra' THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 13 sem regra: ' || coalesce(v_txt,'(sem linha)'); END IF;
  DELETE FROM public.contract_series WHERE id = v_ts2;

  -- ==========================================================================
  -- 14. Antes do inicio -> pulada/antes_inicio
  -- ==========================================================================
  SELECT outcome || '/' || reason INTO v_txt FROM public.close_competencia('2023-06','preview') WHERE series_id = v_ts;
  IF v_txt = 'pulada/antes_inicio' THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 14 antes do inicio: ' || coalesce(v_txt,'(null)'); END IF;

  -- ==========================================================================
  -- 15. Valor zero -> pulada/valor_zero
  -- ==========================================================================
  -- A serie e 'fixo', entao o valor vem da FAIXA, nao de unit x piso: zerar a
  -- faixa e o que produz valor zero.
  UPDATE public.series_rules SET amount = 0 WHERE series_id = v_ts;
  SELECT outcome || '/' || reason INTO v_txt FROM public.close_competencia('2026-09','preview') WHERE series_id = v_ts;
  IF v_txt = 'pulada/valor_zero' THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 15 valor zero: ' || coalesce(v_txt,'(null)'); END IF;
  UPDATE public.series_rules SET amount = 100 WHERE series_id = v_ts;

  -- ==========================================================================
  -- 16-18. Gate de completude do uso
  -- ==========================================================================
  -- 16. uso acima do piso exige snapshot. 2026-12 nao tem client_usage.
  UPDATE public.contract_series
     SET billing_type = 'por_licenca', billing_base_value = 50, billing_floor = 10,
         usage_driven = true, first_competencia = '2024-01', first_due_date = '2024-01-15'
   WHERE id = v_ts;
  SELECT outcome || '/' || reason INTO v_txt FROM public.close_competencia('2026-12','preview') WHERE series_id = v_ts;
  IF v_txt = 'pulada/usage_incomplete' THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 16 sem snapshot: ' || coalesce(v_txt,'(null)'); END IF;

  -- 17. force ignora o gate e fatura o piso
  SELECT outcome || '/' || coalesce(amount::text,'-') INTO v_txt
  FROM public.close_competencia('2026-12','preview', true) WHERE series_id = v_ts;
  IF v_txt = 'emitiria/100.00' THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 17 force: ' || coalesce(v_txt,'(null)') || ' (esperado emitiria/100.00)'; END IF;

  -- 18. travado nao depende de uso -> emite mesmo sem snapshot
  UPDATE public.contract_series SET usage_driven = false WHERE id = v_ts;
  SELECT outcome INTO v_txt FROM public.close_competencia('2026-12','preview') WHERE series_id = v_ts;
  IF v_txt = 'emitiria' THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 18 travado sem snapshot: ' || coalesce(v_txt,'(null)'); END IF;

  -- ==========================================================================
  -- 19-20. Eventuais parcelados
  -- ==========================================================================
  -- 3 parcelas de 15000 comecando em 2026-09: 5000, 5000, 5000.
  INSERT INTO public.series_eventuals (series_id, label, total, installments, first_due_date)
  VALUES (v_ts, 'ZZ Implantacao', 15000, 3, '2026-09-15');

  SELECT count(*) INTO v_n FROM public.close_competencia('2026-09','preview')
  WHERE series_id = v_ts AND kind = 'eventual';
  IF v_n = 1 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 19 eventual: ' || v_n || ' parcelas em 2026-09 (esperado 1)'; END IF;

  -- ==========================================================================
  -- 21. Emissao real + idempotencia
  -- ==========================================================================
  SELECT count(*) INTO v_n FROM public.close_competencia('2026-09','real') WHERE outcome = 'emitida';
  IF v_n >= 5 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 21 emissao real: ' || v_n || ' emitidas (esperado >= 5)'; END IF;

  SELECT count(*) INTO v_n FROM public.close_competencia('2026-09','real') WHERE outcome = 'emitida';
  IF v_n = 0 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 22 idempotencia: ' || v_n || ' emitidas na 2a passada (esperado 0)'; END IF;

  -- ==========================================================================
  -- 23. A fatura emitida bate com o calculado
  -- ==========================================================================
  SELECT i.amount INTO v_amt FROM public.invoices i
  WHERE i.series_id = v_s18 AND i.competencia = '2026-09' AND i.kind = 'recorrencia';
  IF v_amt = 3054.90 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 23 fatura emitida: ' || coalesce(v_amt::text,'null') || ' (esperado 3054.90)'; END IF;

  -- ==========================================================================
  -- 24. Parcela de eventual: valor e agrupamento corretos
  -- ==========================================================================
  SELECT i.amount INTO v_amt FROM public.invoices i
  WHERE i.kind = 'eventual' AND i.competencia = '2026-09' AND i.series_id = v_ts;
  IF v_amt = 5000.00 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 24 parcela: ' || coalesce(v_amt::text,'null') || ' (esperado 5000.00)'; END IF;

  -- ==========================================================================
  -- 25. Log da execucao registrado
  -- ==========================================================================
  SELECT count(*) INTO v_n FROM public.billing_run_log WHERE competencia = '2026-09';
  IF v_n > 0 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 25 run_log vazio'; END IF;

  -- ==========================================================================
  -- 26. Preview nao persiste
  -- ==========================================================================
  SELECT count(*) INTO v_n FROM public.invoices WHERE competencia = '2027-06';
  IF v_n = 0 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 26 preview persistiu ' || v_n || ' faturas'; END IF;

  -- ==========================================================================
  -- 27. Gate do F0: flag desligada bloqueia competencia historica no modo real
  -- ==========================================================================
  UPDATE public.feature_flags SET enabled = false WHERE key = 'billing_f0_approved';
  BEGIN
    PERFORM public.close_competencia('2026-10','real');
    v_failed := v_failed || E'\n  FAIL 27 F0 desligado permitiu emissao historica';
  EXCEPTION WHEN SQLSTATE '22023' THEN v_passed := v_passed + 1; END;
  UPDATE public.feature_flags SET enabled = true WHERE key = 'billing_f0_approved';

  -- ==========================================================================
  -- 28. Paridade com o engine antigo nas series de modulo unico
  -- ==========================================================================
  -- A divergencia so deve aparecer onde o defeito 7 do SDD morde (serie que nao
  -- e 'original'): aqui a segunda serie do cliente 18 tem exatamente esse caso,
  -- entao ela fica FORA da comparacao de paridade.
  FOR v_row IN
    SELECT * FROM (VALUES ('2026-06'), ('2026-07'), ('2026-08'), ('2026-09')) AS m(comp)
  LOOP
    FOR v_sid IN SELECT s.id FROM public.contract_series s
                JOIN public.clients c ON c.id = s.client_id
                WHERE c.lifecycle_stage = 'cliente' AND s.kind = 'original'
                  AND s.id IN (v_s18, v_s20, v_s21)
    LOOP
      SELECT amount INTO v_eng FROM public.close_competencia(v_row.comp,'preview')
      WHERE series_id = v_sid;

      SELECT round(x.mrr_real, 2) INTO v_prev
      FROM public._financeiro_series_month(v_row.comp) x
      WHERE x.series_id = v_sid;

      IF v_prev IS NOT NULL AND v_eng IS NOT NULL AND abs(v_eng - v_prev) > 0.01 THEN
        v_parity_bad := v_parity_bad || E'\n    ' || v_row.comp || ' serie ' || v_sid || ': engine=' || v_eng || ' antigo=' || v_prev;
      END IF;
    END LOOP;
  END LOOP;

  IF v_parity_bad = '' THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 28 paridade:' || v_parity_bad; END IF;

  -- ==========================================================================
  -- 29. Parcela eventual de valor zero e pulada, sem abortar o fechamento
  -- ==========================================================================
  INSERT INTO public.series_eventuals (series_id, label, total, installments, first_due_date)
  VALUES (v_ts, 'parcela zero', 0.01, 2, '2026-09-05');
  SELECT count(*) INTO v_n FROM public.close_competencia('2026-09','real')
  WHERE series_id = v_ts AND kind = 'eventual' AND outcome = 'pulada' AND reason = 'valor_zero';
  DELETE FROM public.series_eventuals WHERE series_id = v_ts AND label = 'parcela zero';
  IF v_n = 1 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 29 parcela zero nao foi pulada (' || v_n || ' linhas)'; END IF;

  -- ==========================================================================
  -- 30. Linha de resumo do log tem outcome proprio, nao conta como emissao
  -- ==========================================================================
  SELECT count(*) INTO v_n FROM public.billing_run_log
  WHERE competencia = '2026-09' AND series_id IS NULL AND outcome = 'resumo';
  IF v_n >= 1 AND NOT EXISTS (
    SELECT 1 FROM public.billing_run_log
    WHERE competencia = '2026-09' AND reason = 'resumo' AND outcome <> 'resumo'
  ) THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 30 resumo sem outcome proprio (' || v_n || ' linhas)'; END IF;

  -- Limpeza do fixture sintetico (o rollback cobre, mas deixa explicito).
  DELETE FROM public.billing_run_log WHERE competencia = '2026-09';
  DELETE FROM public.invoice_entries WHERE invoice_id IN (SELECT id FROM public.invoices WHERE client_id IN (v_c18, v_c20, v_c21, v_tc));
  DELETE FROM public.invoices WHERE client_id IN (v_c18, v_c20, v_c21, v_tc);
  DELETE FROM public.series_eventuals WHERE series_id IN (v_ts, v_extra);
  DELETE FROM public.series_rules WHERE series_id IN (v_s18, v_s20, v_s21, v_ts, v_extra);
  DELETE FROM public.contract_series WHERE id IN (v_ts, v_extra);
  DELETE FROM public.clients WHERE id = v_tc;

  IF coalesce(v_failed, '') = '' THEN
    RAISE EXCEPTION 'SUITE OK — % passed, 0 failed (transacao revertida)', v_passed;
  ELSE
    RAISE EXCEPTION 'SUITE FALHOU — % passed%', v_passed, coalesce(v_failed,'(mensagem nula)');
  END IF;
END $$;
