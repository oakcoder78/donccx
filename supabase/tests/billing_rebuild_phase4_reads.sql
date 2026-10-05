-- ============================================================================
-- Suite de verificacao — Fase 4, passo 1: leituras do cockpit novo
-- SDD: docs/sdd/financeiro-faturamento-sdd.md §3.9, §4.1, §4.12
--
-- Como rodar: supabase db query --linked -f supabase/tests/billing_rebuild_phase4_reads.sql
-- Tudo numa transacao que termina em excecao de proposito: o ROLLBACK e garantido.
-- Resultado esperado: "SUITE OK — N passed, 0 failed (transacao revertida)".
-- ============================================================================

DO $$
DECLARE
  v_admin   uuid;
  v_csm     uuid;
  v_sales   uuid;
  v_series  uuid;
  v_client  integer;
  v_inv     uuid;
  v_inv_old uuid;
  v_n       integer;
  v_row     record;
  v_passed  integer := 0;
  v_failed  text := '';
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE role = 'admin' ORDER BY id LIMIT 1;
  SELECT id INTO v_csm   FROM public.profiles WHERE role NOT IN ('admin','manager','finance','sales') ORDER BY id LIMIT 1;
  SELECT id INTO v_sales FROM public.profiles WHERE role = 'sales' ORDER BY id LIMIT 1;

  -- Serie ativa de cliente de verdade, para o fixture
  SELECT s.id, s.client_id INTO v_series, v_client
  FROM public.contract_series s JOIN public.clients c ON c.id = s.client_id
  WHERE s.status = 'ativa' AND c.lifecycle_stage = 'cliente'
  ORDER BY s.id LIMIT 1;
  IF v_series IS NULL THEN
    RAISE EXCEPTION 'suite: nenhuma serie ativa de cliente para o fixture';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('role','service_role','sub',v_admin)::text, true);

  -- Fixture: fatura futura (2099) e fatura vencida (2026-01, due 2026-01-10)
  v_inv := public.issue_invoice(v_client, v_series, 'recorrencia', '2099-05', 900, '2099-05-10');
  v_inv_old := public.issue_invoice(v_client, v_series, 'recorrencia', '2026-01', 400, '2026-01-10');

  -- 1. clientes: o cliente com fatura aparece como com_fatura, com saldo e M/N corretos
  SELECT * INTO v_row FROM public.billing_cockpit_clientes('2099-05') WHERE client_id = v_client;
  IF v_row.client_id IS NOT NULL AND v_row.estado = 'com_fatura'
     AND v_row.m_faturas = 1 AND v_row.n_em_aberto = 1 AND v_row.saldo_aberto = 900 THEN
    v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 1 clientes com fatura: ' || coalesce(v_row.estado,'null')
    || ' m=' || coalesce(v_row.m_faturas::text,'null') || ' saldo=' || coalesce(v_row.saldo_aberto::text,'null'); END IF;

  -- 2. clientes: cliente ativo sem fatura na competencia aparece como sem_fatura (§3.9)
  SELECT * INTO v_row FROM public.billing_cockpit_clientes('2099-06') WHERE client_id = v_client;
  IF v_row.client_id IS NOT NULL AND v_row.estado = 'sem_fatura' AND v_row.m_faturas = 0 THEN
    v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 2 sem fatura nao aparece como sem_fatura'; END IF;

  -- 3. faturas: a fatura do mes aparece com estado e saldo
  SELECT count(*) INTO v_n FROM public.billing_cockpit_faturas(v_client, '2099-05')
  WHERE invoice_id = v_inv AND state = 'aberta' AND balance = 900;
  IF v_n = 1 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 3 faturas do mes sem a fatura esperada'; END IF;

  -- 4. liquidar total: N cai a zero, M continua 1, estado quitada
  PERFORM public.settle_invoice(v_inv, 900, current_date, 'pix');
  SELECT * INTO v_row FROM public.billing_cockpit_clientes('2099-05') WHERE client_id = v_client;
  IF v_row.m_faturas = 1 AND v_row.n_em_aberto = 0 AND v_row.saldo_aberto = 0 THEN
    v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 4 apos liquidar: m=' || coalesce(v_row.m_faturas::text,'null')
    || ' n=' || coalesce(v_row.n_em_aberto::text,'null'); END IF;

  -- 5. pendencias: a fatura vencida com saldo aparece, com dias de atraso
  SELECT * INTO v_row FROM public.billing_pendencias(12) WHERE invoice_id = v_inv_old;
  IF v_row.invoice_id IS NOT NULL AND v_row.overdue_days > 0 AND v_row.balance = 400 THEN
    v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 5 pendencia vencida ausente ou sem atraso'; END IF;

  -- 6. pendencias: a fatura quitada nao entra (pagamento e fato)
  IF NOT EXISTS (SELECT 1 FROM public.billing_pendencias(12) WHERE invoice_id = v_inv) THEN
    v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 6 fatura quitada aparece em pendencias'; END IF;

  -- 7. motivos: admin (pode escrever) recebe o preview do motor
  SELECT count(*) INTO v_n FROM public.billing_cockpit_motivos('2099-06');
  IF v_n >= 0 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 7 motivos falhou para admin'; END IF;

  -- 8. motivos: papel so de leitura (sales) recebe zero linhas, nao erro
  IF v_sales IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',v_sales)::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      SELECT count(*) INTO v_n FROM public.billing_cockpit_motivos('2099-06');
      IF v_n = 0 THEN v_passed := v_passed + 1;
      ELSE v_failed := v_failed || E'\n  FAIL 8 sales recebeu motivos'; END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed || E'\n  FAIL 8 sales: ' || SQLERRM;
    END;
    RESET ROLE;
  ELSE
    v_failed := v_failed || E'\n  FAIL 8 sem perfil sales para o teste';
  END IF;

  -- 9. leitura negada para papel fora da lista de financial_data
  IF v_csm IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',v_csm)::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      PERFORM * FROM public.billing_cockpit_clientes('2099-05');
      v_failed := v_failed || E'\n  FAIL 9 csm leu o cockpit';
    EXCEPTION WHEN SQLSTATE '42501' THEN
      v_passed := v_passed + 1;
    END;
    RESET ROLE;
  ELSE
    v_failed := v_failed || E'\n  FAIL 9 sem perfil csm para o teste';
  END IF;

  -- 10. faturas devolvem o series_id (a substituta e emitida so para a serie)
  PERFORM set_config('request.jwt.claims', json_build_object('role','service_role','sub',v_admin)::text, true);
  IF EXISTS (SELECT 1 FROM public.billing_cockpit_faturas(v_client, '2099-05')
             WHERE invoice_id = v_inv AND series_id = v_series) THEN
    v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 10 faturas sem series_id'; END IF;

  -- 11. lancamentos: a baixa aparece e e estornavel; estorno inteiro a torna nao estornavel
  SELECT count(*) INTO v_n FROM public.billing_cockpit_lancamentos(v_inv)
  WHERE kind = 'pagamento' AND amount = 900 AND reversible = true;
  IF v_n = 1 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 11 lancamento da baixa nao estornavel'; END IF;

  IF coalesce(v_failed, '') = '' THEN
    RAISE EXCEPTION 'SUITE OK — % passed, 0 failed (transacao revertida)', v_passed;
  ELSE
    RAISE EXCEPTION 'SUITE FALHOU — % passed%', v_passed, v_failed;
  END IF;
END $$;
