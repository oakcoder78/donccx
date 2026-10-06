-- ============================================================================
-- Teste — Fase 4: barreira de competencia nao consolidada no banco.
-- Cria uma fatura numa competencia simulada como consolidada (2099-05), depois
-- remove a simulacao desse mes e tenta ler e alterar. Tudo e revertido: nada
-- depende de dados [TESTE] em producao.
--
-- Resultado esperado: "BARREIRA OK — N passed, 0 failed (transacao revertida)".
-- ============================================================================

DO $$
DECLARE
  v_admin   uuid;
  v_client  integer;
  v_series  uuid;
  v_fat_out uuid;
  v_status  text;
  v_n       integer;
  v_passed  integer := 0;
  v_failed  text := '';
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE role = 'admin' ORDER BY id LIMIT 1;

  -- Serie ativa de cliente de verdade: o fixture e revertido no final
  SELECT s.id, s.client_id INTO v_series, v_client
  FROM public.contract_series s JOIN public.clients c ON c.id = s.client_id
  WHERE s.status = 'ativa' AND c.lifecycle_stage = 'cliente'
  ORDER BY s.id LIMIT 1;
  IF v_series IS NULL THEN
    RAISE EXCEPTION 'BARREIRA SEM FIXTURE: nenhuma serie ativa de cliente';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',v_admin)::text, true);

  -- Simula meses consolidados pelo cron (so nesta transacao, revertida no final)
  INSERT INTO public.sync_service_log (ref_month, service_name, triggered_by, status, started_at, finished_at)
  SELECT to_char(m, 'YYYY-MM'), 'donc-api', 'cron', 'success', m + interval '1 month', m + interval '1 month' + interval '1 second'
  FROM generate_series(date '2026-01-01', date '2100-12-01', interval '1 month') m;

  -- Fatura emitida em 2099-05, enquanto o mes ainda esta simulado como consolidado
  v_fat_out := public.issue_invoice(v_client, v_series, 'recorrencia', '2099-05', 900, '2099-05-10');

  -- Agora 2099-05 deixa de ser consolidado: remove so a simulacao desse mes
  DELETE FROM public.sync_service_log WHERE ref_month = '2099-05';

  -- Leituras do mes nao consolidado: recusadas
  BEGIN
    PERFORM * FROM public.billing_cockpit_faturas(v_client, '2099-05');
    v_failed := v_failed || E'\n  FAIL 1 leitura de faturas de 2099-05 foi aceita';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'competencia_nao_consolidada%' THEN v_passed := v_passed + 1;
    ELSE v_failed := v_failed || E'\n  FAIL 1 erro inesperado: ' || SQLERRM; END IF;
  END;

  BEGIN
    PERFORM * FROM public.billing_cockpit_clientes('2099-05');
    v_failed := v_failed || E'\n  FAIL 2 lista de clientes de 2099-05 foi aceita';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'competencia_nao_consolidada%' THEN v_passed := v_passed + 1;
    ELSE v_failed := v_failed || E'\n  FAIL 2 erro inesperado: ' || SQLERRM; END IF;
  END;

  BEGIN
    PERFORM * FROM public.billing_cockpit_lancamentos(v_fat_out);
    v_failed := v_failed || E'\n  FAIL 3 lancamentos de fatura de 2099-05 foram aceitos';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'competencia_nao_consolidada%' THEN v_passed := v_passed + 1;
    ELSE v_failed := v_failed || E'\n  FAIL 3 erro inesperado: ' || SQLERRM; END IF;
  END;

  -- Escritas na fatura do mes nao consolidado: recusadas, e a fatura continua igual
  BEGIN
    PERFORM public.cancel_invoice(v_fat_out, 'motivo de teste da barreira');
    v_failed := v_failed || E'\n  FAIL 4 cancelamento de fatura de 2099-05 foi aceito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'competencia_nao_consolidada%' THEN v_passed := v_passed + 1;
    ELSE v_failed := v_failed || E'\n  FAIL 4 erro inesperado: ' || SQLERRM; END IF;
  END;

  BEGIN
    PERFORM public.settle_invoice(v_fat_out, 1, current_date, 'pix', NULL, NULL, NULL);
    v_failed := v_failed || E'\n  FAIL 5 baixa em fatura de 2099-05 foi aceita';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'competencia_nao_consolidada%' THEN v_passed := v_passed + 1;
    ELSE v_failed := v_failed || E'\n  FAIL 5 erro inesperado: ' || SQLERRM; END IF;
  END;

  BEGIN
    PERFORM public.adjust_invoice(v_fat_out, 1, 'motivo de teste da barreira');
    v_failed := v_failed || E'\n  FAIL 6 ajuste de fatura de 2099-05 foi aceito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'competencia_nao_consolidada%' THEN v_passed := v_passed + 1;
    ELSE v_failed := v_failed || E'\n  FAIL 6 erro inesperado: ' || SQLERRM; END IF;
  END;

  SELECT status INTO v_status FROM public.invoices WHERE id = v_fat_out;
  IF v_status = 'emitida' THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 7 fatura mudou de status: ' || v_status; END IF;

  -- Mes consolidado continua funcionando
  BEGIN
    PERFORM * FROM public.billing_cockpit_faturas(v_client, '2099-04');
    v_passed := v_passed + 1;
  EXCEPTION WHEN OTHERS THEN
    v_failed := v_failed || E'\n  FAIL 8 leitura de 2099-04 (consolidado) foi recusada: ' || SQLERRM;
  END;

  IF v_failed = '' THEN
    RAISE EXCEPTION 'BARREIRA OK — % passed, 0 failed (transacao revertida)', v_passed;
  ELSE
    RAISE EXCEPTION 'BARREIRA FALHOU — % passed%', v_passed, v_failed;
  END IF;
END $$;
