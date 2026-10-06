-- ============================================================================
-- Teste — Fase 4: barreira de competencia nao consolidada no banco.
-- Usa a fatura do [TESTE] Beta de 2026-10 (fixture de teste) e tenta ler e
-- alterar. Tudo e revertido no final: a escrita, se passasse, seria desfeita.
--
-- Resultado esperado: "BARREIRA OK — N passed, 0 failed (transacao revertida)".
-- ============================================================================

DO $$
DECLARE
  v_admin   uuid;
  v_beta    integer;
  v_fat_out uuid;
  v_status  text;
  v_n       integer;
  v_passed  integer := 0;
  v_failed  text := '';
  v_erro    text;
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE role = 'admin' ORDER BY id LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',v_admin)::text, true);

  SELECT id INTO v_beta FROM public.clients WHERE name = '[TESTE] Beta Ltda';
  SELECT i.id INTO v_fat_out FROM public.invoices i
  WHERE i.client_id = v_beta AND i.competencia = '2026-10' AND i.status = 'emitida' ORDER BY i.id LIMIT 1;
  IF v_fat_out IS NULL THEN
    RAISE EXCEPTION 'BARREIRA SEM FIXTURE: fatura de 2026-10 do [TESTE] Beta nao existe';
  END IF;

  -- Leituras do mes nao consolidado: recusadas
  BEGIN
    PERFORM * FROM public.billing_cockpit_faturas(v_beta, '2026-10');
    v_failed := v_failed || E'\n  FAIL 1 leitura de faturas de 2026-10 foi aceita';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'competencia_nao_consolidada%' THEN v_passed := v_passed + 1;
    ELSE v_failed := v_failed || E'\n  FAIL 1 erro inesperado: ' || SQLERRM; END IF;
  END;

  BEGIN
    PERFORM * FROM public.billing_cockpit_clientes('2026-10');
    v_failed := v_failed || E'\n  FAIL 2 lista de clientes de 2026-10 foi aceita';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'competencia_nao_consolidada%' THEN v_passed := v_passed + 1;
    ELSE v_failed := v_failed || E'\n  FAIL 2 erro inesperado: ' || SQLERRM; END IF;
  END;

  BEGIN
    PERFORM * FROM public.billing_cockpit_lancamentos(v_fat_out);
    v_failed := v_failed || E'\n  FAIL 3 lancamentos de fatura de 2026-10 foram aceitos';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'competencia_nao_consolidada%' THEN v_passed := v_passed + 1;
    ELSE v_failed := v_failed || E'\n  FAIL 3 erro inesperado: ' || SQLERRM; END IF;
  END;

  -- Escritas na fatura do mes nao consolidado: recusadas, e a fatura continua igual
  BEGIN
    PERFORM public.cancel_invoice(v_fat_out, 'motivo de teste da barreira');
    v_failed := v_failed || E'\n  FAIL 4 cancelamento de fatura de 2026-10 foi aceito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'competencia_nao_consolidada%' THEN v_passed := v_passed + 1;
    ELSE v_failed := v_failed || E'\n  FAIL 4 erro inesperado: ' || SQLERRM; END IF;
  END;

  BEGIN
    PERFORM public.settle_invoice(v_fat_out, 1, current_date, 'pix', NULL, NULL, NULL);
    v_failed := v_failed || E'\n  FAIL 5 baixa em fatura de 2026-10 foi aceita';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'competencia_nao_consolidada%' THEN v_passed := v_passed + 1;
    ELSE v_failed := v_failed || E'\n  FAIL 5 erro inesperado: ' || SQLERRM; END IF;
  END;

  BEGIN
    PERFORM public.adjust_invoice(v_fat_out, 1, 'motivo de teste da barreira');
    v_failed := v_failed || E'\n  FAIL 6 ajuste de fatura de 2026-10 foi aceito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'competencia_nao_consolidada%' THEN v_passed := v_passed + 1;
    ELSE v_failed := v_failed || E'\n  FAIL 6 erro inesperado: ' || SQLERRM; END IF;
  END;

  SELECT status INTO v_status FROM public.invoices WHERE id = v_fat_out;
  IF v_status = 'emitida' THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 7 fatura mudou de status: ' || v_status; END IF;

  -- Mes consolidado continua funcionando
  SELECT count(*) INTO v_n FROM public.billing_cockpit_faturas(v_beta, '2026-09');
  IF v_n >= 1 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 8 leitura de 2026-09 nao retornou faturas'; END IF;

  IF v_failed = '' THEN
    RAISE EXCEPTION 'BARREIRA OK — % passed, 0 failed (transacao revertida)', v_passed;
  ELSE
    RAISE EXCEPTION 'BARREIRA FALHOU — % passed%', v_passed, v_failed;
  END IF;
END $$;
