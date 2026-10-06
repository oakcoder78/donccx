-- ============================================================================
-- Teste — Fase 4: trava de consolidacao e encerrar com corte.
-- Cria um cliente "[TESTE] ..." e uma serie por licenca dentro da transacao e
-- termina em excecao de proposito: o ROLLBACK garante que nada fica.
--
-- Simula a sincronizacao inserindo uma linha de uso de 2026-10 (a sincronizacao
-- real nao roda no banco). Simula o usuario logado pelo request.jwt.claims.
--
-- Resultado esperado: "CORTE OK — N passed, 0 failed (transacao revertida)".
-- ============================================================================

DO $$
DECLARE
  v_admin     uuid;
  v_sem_papel uuid;
  v_client    integer;
  v_serie     uuid;
  v_comp      text := to_char(current_date, 'YYYY-MM');
  v_res       jsonb;
  v_n         integer;
  v_valor     numeric;
  v_status    text;
  v_passed    integer := 0;
  v_failed    text := '';
  v_erro      text;
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE role = 'admin' ORDER BY id LIMIT 1;
  SELECT id INTO v_sem_papel FROM public.profiles
    WHERE role NOT IN ('admin','manager','finance','sales') ORDER BY id LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',v_admin)::text, true);

  -- Fixture: cliente por licenca, piso 2, unidade 50, regra 100 (base)
  INSERT INTO public.clients (name, fantasy_name, lifecycle_stage, billing_status, billing_type)
  VALUES ('[TESTE] Corte Ltda', '[TESTE] Corte', 'cliente', 'ativo', 'por_licenca') RETURNING id INTO v_client;

  INSERT INTO public.contract_series (client_id, kind, label, billing_start, first_competencia, first_due_date,
                                      usage_driven, billing_type, billing_base_value, billing_floor, status)
  VALUES (v_client, 'original', '[TESTE] contrato Corte', '2026-01-01', '2026-01', '2026-01-10',
          true, 'por_licenca', 50, 2, 'ativa') RETURNING id INTO v_serie;

  INSERT INTO public.series_rules (series_id, month_from, month_to, mode, amount)
  VALUES (v_serie, 1, NULL, 'amount', 100);

  -- Trava: 2026-09 foi consolidado pelo cron (sync de 01/10); o mes corrente nao
  IF public.billing_competencia_consolidada('2026-09') THEN
    v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 1 2026-09 deveria estar consolidada'; END IF;

  IF NOT public.billing_competencia_consolidada(v_comp) THEN
    v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 2 mes corrente nao deveria estar consolidado'; END IF;

  -- Trava: fechamento real do mes nao consolidado e recusado
  BEGIN
    PERFORM * FROM public.close_competencia(v_comp, 'real', false, ARRAY[v_serie]);
    v_failed := v_failed || E'\n  FAIL 3 fechamento real de mes nao consolidado foi aceito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'competencia_nao_consolidada%' THEN v_passed := v_passed + 1;
    ELSE v_failed := v_failed || E'\n  FAIL 3 erro inesperado: ' || SQLERRM; END IF;
  END;

  -- Previa continua livre (nao e bloqueada)
  BEGIN
    PERFORM * FROM public.close_competencia(v_comp, 'preview', false, NULL);
    v_passed := v_passed + 1;
  EXCEPTION WHEN OTHERS THEN
    v_failed := v_failed || E'\n  FAIL 4 previa bloqueada: ' || SQLERRM;
  END;

  -- Corte: sem motivo curto, sem confirmacao, sem snapshot, pendente
  BEGIN
    PERFORM public.encerrar_com_corte(v_serie, 'curto', true);
    v_failed := v_failed || E'\n  FAIL 5 motivo curto foi aceito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%10 caracteres%' THEN v_passed := v_passed + 1;
    ELSE v_failed := v_failed || E'\n  FAIL 5 erro inesperado: ' || SQLERRM; END IF;
  END;

  BEGIN
    PERFORM public.encerrar_com_corte(v_serie, 'motivo de teste do corte', false);
    v_failed := v_failed || E'\n  FAIL 6 corte sem confirmacao de uso foi aceito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%conferido%' THEN v_passed := v_passed + 1;
    ELSE v_failed := v_failed || E'\n  FAIL 6 erro inesperado: ' || SQLERRM; END IF;
  END;

  BEGIN
    PERFORM public.encerrar_com_corte(v_serie, 'motivo de teste do corte', true);
    v_failed := v_failed || E'\n  FAIL 7 corte sem snapshot foi aceito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Sem sincronização%' THEN v_passed := v_passed + 1;
    ELSE v_failed := v_failed || E'\n  FAIL 7 erro inesperado: ' || SQLERRM; END IF;
  END;

  -- Simula a sincronizacao: uso de 5 profissionais ativos em 2026-10, sem pendencia
  INSERT INTO public.client_usage (client_id, ref_month, profissionais_versao, pending)
  VALUES (v_client, v_comp, '[{"ativo":true},{"ativo":true},{"ativo":true},{"ativo":true},{"ativo":true}]'::jsonb, true);

  BEGIN
    PERFORM public.encerrar_com_corte(v_serie, 'motivo de teste do corte', true);
    v_failed := v_failed || E'\n  FAIL 8 corte com linha pendente foi aceito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%pendentes%' THEN v_passed := v_passed + 1;
    ELSE v_failed := v_failed || E'\n  FAIL 8 erro inesperado: ' || SQLERRM; END IF;
  END;

  UPDATE public.client_usage SET pending = false WHERE client_id = v_client AND ref_month = v_comp;

  -- Permissao: perfil sem papel financeiro nao cobra
  IF v_sem_papel IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',v_sem_papel)::text, true);
    BEGIN
      PERFORM public.encerrar_com_corte(v_serie, 'motivo de teste do corte', true);
      v_failed := v_failed || E'\n  FAIL 9 perfil sem papel cobrou o corte';
    EXCEPTION WHEN OTHERS THEN
      IF SQLSTATE = '42501' THEN v_passed := v_passed + 1;
      ELSE v_failed := v_failed || E'\n  FAIL 9 erro inesperado: ' || SQLERRM; END IF;
    END;
    PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',v_admin)::text, true);
  END IF;

  -- Caminho feliz: corte emitido e serie encerrada
  v_res := public.encerrar_com_corte(v_serie, 'motivo de teste do corte', true);

  SELECT count(*), coalesce(sum(amount), 0) INTO v_n, v_valor
  FROM public.invoices
  WHERE series_id = v_serie AND competencia = v_comp AND kind = 'recorrencia' AND status = 'emitida';

  IF v_n = 1 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 10 esperava 1 fatura do corte, veio ' || v_n; END IF;

  -- Base integral 100 + excedente (5 - 2) x 50 = 150  ->  250
  IF v_valor = 250 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 11 valor do corte deveria ser 250, veio ' || v_valor; END IF;

  IF (v_res->>'faturas_emitidas')::integer = 1 AND (v_res->>'valor_emitido')::numeric = 250 THEN
    v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 12 retorno do corte: ' || v_res::text; END IF;

  SELECT status INTO v_status FROM public.contract_series WHERE id = v_serie;
  IF v_status = 'encerrada' THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 13 serie deveria estar encerrada, esta ' || v_status; END IF;

  -- Segunda cobranca: a serie ja esta encerrada e o corte recusa
  BEGIN
    PERFORM public.encerrar_com_corte(v_serie, 'motivo de teste do corte', true);
    v_failed := v_failed || E'\n  FAIL 14 segundo corte foi aceito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Só séries ativas%' THEN v_passed := v_passed + 1;
    ELSE v_failed := v_failed || E'\n  FAIL 14 erro inesperado: ' || SQLERRM; END IF;
  END;

  IF v_failed = '' THEN
    RAISE EXCEPTION 'CORTE OK — % passed, 0 failed (transacao revertida)', v_passed;
  ELSE
    RAISE EXCEPTION 'CORTE FALHOU — % passed%', v_passed, v_failed;
  END IF;
END $$;
