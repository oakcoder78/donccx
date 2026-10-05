-- ============================================================================
-- Teste E2E — Fase 4: roteiro do cockpit com dados ficticios, no nivel das RPCs
-- Cria clientes "[TESTE] ..." numa transacao e termina em excecao de proposito:
-- o ROLLBACK garante que nada fica. O roteiro de tela (com a flag
-- cockpit_faturamento) usa o fixture persistente em supabase/fixtures/billing_test.
--
-- Resultado esperado: "E2E OK — N passed, 0 failed (transacao revertida)".
-- ============================================================================

DO $$
DECLARE
  v_admin   uuid;
  v_alfa    integer;
  v_beta    integer;
  v_gama    integer;
  v_sa      uuid;
  v_sb      uuid;
  v_sg      uuid;
  v_n       integer;
  v_row     record;
  v_inv_a   uuid;
  v_inv_b   uuid;
  v_inv_ev  uuid;
  v_entry   uuid;
  v_grp     uuid := gen_random_uuid();
  v_res     jsonb;
  v_passed  integer := 0;
  v_failed  text := '';
  v_erro    text;
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE role = 'admin' ORDER BY id LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('role','service_role','sub',v_admin)::text, true);

  -- Fixture: 3 clientes ficticios
  INSERT INTO public.clients (name, fantasy_name, lifecycle_stage, billing_status, billing_type)
  VALUES ('[TESTE] Alfa Ltda', '[TESTE] Alfa', 'cliente', 'ativo', 'por_licenca') RETURNING id INTO v_alfa;
  INSERT INTO public.clients (name, fantasy_name, lifecycle_stage, billing_status, billing_type)
  VALUES ('[TESTE] Beta Ltda', '[TESTE] Beta', 'cliente', 'ativo', 'por_licenca') RETURNING id INTO v_beta;
  INSERT INTO public.clients (name, fantasy_name, lifecycle_stage, billing_status, billing_type)
  VALUES ('[TESTE] Gama Ltda', '[TESTE] Gama', 'cliente', 'ativo', 'por_licenca') RETURNING id INTO v_gama;

  -- Uso do Alfa em 2026-09: 5 profissionais ativos, snapshot completo
  INSERT INTO public.client_usage (client_id, ref_month, profissionais_versao, pending)
  VALUES (v_alfa, '2026-09', '[{"ativo":true},{"ativo":true},{"ativo":true},{"ativo":true},{"ativo":true}]'::jsonb, false);

  -- Series: Alfa usage-driven (excedente), Beta travado com eventual, Gama sem regra
  INSERT INTO public.contract_series (client_id, kind, label, billing_start, first_competencia, first_due_date,
                                      usage_driven, billing_type, billing_base_value, billing_floor, status)
  VALUES (v_alfa, 'original', '[TESTE] contrato Alfa', '2026-01-01', '2026-01', '2026-01-10',
          true, 'por_licenca', 50, 2, 'ativa') RETURNING id INTO v_sa;
  INSERT INTO public.contract_series (client_id, kind, label, billing_start, first_competencia, first_due_date,
                                      usage_driven, billing_type, billing_base_value, billing_floor, status)
  VALUES (v_beta, 'original', '[TESTE] contrato Beta', '2026-01-01', '2026-01', '2026-01-10',
          false, 'fixo', 0, 0, 'ativa') RETURNING id INTO v_sb;
  INSERT INTO public.contract_series (client_id, kind, label, billing_start, first_competencia, first_due_date,
                                      usage_driven, billing_type, billing_base_value, billing_floor, status)
  VALUES (v_gama, 'original', '[TESTE] contrato Gama', '2026-01-01', '2026-01', '2026-01-10',
          false, 'fixo', 0, 0, 'ativa') RETURNING id INTO v_sg;

  INSERT INTO public.series_rules (series_id, month_from, month_to, mode, amount)
  VALUES (v_sa, 1, NULL, 'amount', 100), (v_sb, 1, NULL, 'amount', 300);
  -- Gama: sem regra de proposito

  INSERT INTO public.series_eventuals (series_id, label, total, installments, first_due_date)
  VALUES (v_sb, '[TESTE] implantacao', 900, 3, '2026-09-05');

  -- 1. Preview: emitiria as faturas certas, e sinaliza Gama como sem_regra
  SELECT count(*) INTO v_n FROM public.close_competencia('2026-09', 'preview')
  WHERE series_id = v_sa AND outcome = 'emitiria' AND amount = 250;
  IF v_n = 1 THEN v_passed := v_passed + 1; ELSE v_failed := v_failed || E'\n  FAIL 1 preview Alfa != 250 (base 100 + excedente 150)'; END IF;

  IF EXISTS (SELECT 1 FROM public.close_competencia('2026-09', 'preview')
             WHERE series_id = v_sg AND outcome = 'pulada' AND reason = 'sem_regra') THEN
    v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 2 Gama nao aparece como sem_regra'; END IF;

  -- 3. Preview nao grava
  IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE client_id = v_alfa) THEN
    v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 3 preview gravou fatura'; END IF;

  -- 4. Fechar real emite Alfa (250), Beta recorrencia (300) e Beta eventual parcela 1 (300)
  PERFORM public.close_competencia('2026-09', 'real');
  SELECT * INTO v_row FROM public.billing_cockpit_clientes('2026-09') WHERE client_id = v_alfa;
  IF v_row.estado = 'com_fatura' AND v_row.m_faturas = 1 AND v_row.saldo_aberto = 250 THEN
    v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 4 Alfa nao aparece com 1 fatura de 250 em aberto'; END IF;

  SELECT id INTO v_inv_a FROM public.invoices WHERE series_id = v_sa AND competencia = '2026-09';
  SELECT id INTO v_inv_b FROM public.invoices WHERE series_id = v_sb AND competencia = '2026-09' AND kind = 'recorrencia';
  SELECT id INTO v_inv_ev FROM public.invoices WHERE series_id = v_sb AND kind = 'eventual';

  -- 5. Fechar de novo nao emite de novo (idempotencia)
  SELECT count(*) INTO v_n FROM public.invoices WHERE client_id IN (v_alfa, v_beta);
  PERFORM public.close_competencia('2026-09', 'real');
  IF (SELECT count(*) FROM public.invoices WHERE client_id IN (v_alfa, v_beta)) = v_n THEN
    v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 5 segundo fechamento emitiu de novo'; END IF;

  -- 6. Baixa parcial: saldo cai, estado vencida (vencimento 2026-09-10 ja passou)
  PERFORM public.settle_invoice(v_inv_a, 100, current_date, 'pix');
  SELECT * INTO v_row FROM public.billing_cockpit_faturas(v_alfa, '2026-09');
  IF v_row.balance = 150 AND v_row.state = 'vencida' THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 6 apos baixa parcial: saldo ' || coalesce(v_row.balance::text,'null') || ' estado ' || coalesce(v_row.state,'null'); END IF;

  -- 7. Desconto aplicado: saldo cai de novo
  PERFORM public.discount_invoice(v_inv_a, 50, 'desconto negociado no teste E2E');
  IF (SELECT balance FROM public.invoice_balance WHERE id = v_inv_a) = 100 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 7 desconto nao reduziu o saldo'; END IF;

  -- 8. Baixa por perda do restante: quitada
  PERFORM public.write_off_invoice(v_inv_a, 100, 'incobravel confirmado no teste E2E');
  IF (SELECT state FROM public.invoice_balance WHERE id = v_inv_a) = 'quitada' THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 8 baixa por perda nao quitou a fatura'; END IF;

  -- 9. Estorno da perda: saldo volta a 100
  SELECT id INTO v_entry FROM public.invoice_entries WHERE invoice_id = v_inv_a AND kind = 'baixa';
  PERFORM public.reverse_entry(v_entry, 'estorno da perda para testar o retorno do saldo');
  IF (SELECT balance FROM public.invoice_balance WHERE id = v_inv_a) = 100 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 9 estorno nao devolveu o saldo'; END IF;

  -- 10. Ajuste para 230: valor novo, liquidado (150) continua coberto
  PERFORM public.adjust_invoice(v_inv_a, 230, 'ajuste de valor no teste E2E');
  IF (SELECT amount FROM public.invoices WHERE id = v_inv_a) = 230 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 10 ajuste nao gravou'; END IF;

  -- 11. Cancelar fatura com caixa registrado e recusado
  BEGIN
    PERFORM public.cancel_invoice(v_inv_a, 'cancelamento com caixa registrado');
    v_failed := v_failed || E'\n  FAIL 11 cancelou fatura com caixa';
  EXCEPTION WHEN SQLSTATE '22023' THEN v_passed := v_passed + 1; END;

  -- 12. Parcela eventual sem lancamento: cancela, e o motor nao a reemite
  PERFORM public.cancel_invoice(v_inv_ev, 'parcela cancelada no teste E2E');
  PERFORM public.close_competencia('2026-09', 'real');
  IF (SELECT status FROM public.invoices WHERE id = v_inv_ev) = 'cancelada'
     AND (SELECT count(*) FROM public.invoices WHERE series_id = v_sb AND kind = 'eventual' AND status = 'emitida') = 0 THEN
    v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 12 parcela cancelada foi reemitida'; END IF;

  -- 13. Substituta da recorrencia do Beta: cancela e o motor reemite so a serie
  PERFORM public.cancel_invoice(v_inv_b, 'cancelamento para testar a substituta');
  PERFORM public.close_competencia('2026-09', 'real', false, ARRAY[v_sb]);
  IF (SELECT count(*) FROM public.invoices WHERE series_id = v_sb AND competencia = '2026-09'
        AND kind = 'recorrencia' AND status = 'emitida') = 1
     AND (SELECT status FROM public.invoices WHERE id = v_inv_b) = 'cancelada' THEN
    v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 13 substituta nao foi emitida so para a serie'; END IF;

  -- 14. Encerrar com os dois flags false nao cancela nada (escolha explicita)
  v_res := public.encerrar_series(v_sa, false, NULL, 'encerramento sem cancelamento no teste E2E', false, false);
  IF (v_res->>'faturas_canceladas')::int = 0 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 14 encerrar cancelou sem escolha'; END IF;

  -- 15. Pendencias: a fatura vencida com saldo aparece
  IF EXISTS (SELECT 1 FROM public.billing_pendencias(12) WHERE client_id = v_alfa) THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 15 pendencia do Alfa ausente'; END IF;

  -- 16. Motivos para quem escreve: Gama aparece como sem_regra
  IF EXISTS (SELECT 1 FROM public.billing_cockpit_motivos('2026-09') WHERE client_id = v_gama AND reason = 'sem_regra') THEN
    v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 16 motivos sem sem_regra do Gama'; END IF;

  IF v_failed = '' THEN
    RAISE EXCEPTION 'E2E OK — % passed, 0 failed (transacao revertida)', v_passed;
  ELSE
    RAISE EXCEPTION 'E2E FALHOU — % passed%', v_passed, v_failed;
  END IF;
END $$;
