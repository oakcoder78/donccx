-- ============================================================================
-- Teste — salvar_regras_contrato: regras e eventuais a partir da aba Contratos.
-- Usa uma serie ativa real, dentro de transacao revertida. Cria um eventual ja
-- faturado para provar que ele nao e apagado nem reemitido.
--
-- Resultado esperado: "SALVAR REGRAS OK — N passed, 0 failed (transacao revertida)".
-- ============================================================================

DO $$
DECLARE
  v_admin     uuid;
  v_series    uuid;
  v_client    integer;
  v_e1        uuid;
  v_inv       uuid;
  v_res       jsonb;
  v_n         integer;
  v_passed    integer := 0;
  v_failed    text := '';
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE role = 'admin' ORDER BY id LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',v_admin)::text, true);

  SELECT s.id, s.client_id INTO v_series, v_client
  FROM public.contract_series s JOIN public.clients c ON c.id = s.client_id
  WHERE s.status = 'ativa' AND c.lifecycle_stage = 'cliente'
  ORDER BY s.id LIMIT 1;
  IF v_series IS NULL THEN RAISE EXCEPTION 'SALVAR REGRAS SEM FIXTURE: nenhuma serie ativa'; END IF;

  -- Eventual ja faturado (parcela unica), com fatura emitida apontando para ele
  INSERT INTO public.series_eventuals (series_id, label, total, installments, first_due_date)
  VALUES (v_series, 'Protegido teste', 300, 1, '2099-06-05') RETURNING id INTO v_e1;
  v_inv := public.issue_invoice(v_client, v_series, 'eventual'::text, '2099-06'::text, 300::numeric, '2099-06-05'::date,
                                NULL::text, v_e1, 1::smallint, 1::smallint, NULL::uuid);

  -- 1) Primeira gravacao: 1 regra aberta, 1 eventual reconhecido, 1 novo
  v_res := public.salvar_regras_contrato(v_series,
    '[{"month_from":1,"month_to":null,"amount":2995}]'::jsonb,
    '[{"label":"Protegido teste","total":300,"installments":1,"first_due_date":"2099-06-05"},
      {"label":"Novo teste","total":900,"installments":3,"first_due_date":"2099-07-05"}]'::jsonb);

  SELECT count(*) INTO v_n FROM public.series_rules WHERE series_id = v_series AND month_from = 1 AND month_to IS NULL AND amount = 2995;
  IF v_n = 1 THEN v_passed := v_passed + 1; ELSE v_failed := v_failed || E'\n  FAIL 1 regra 1..aberta nao gravada'; END IF;

  IF (v_res->>'eventuais_inseridos')::int = 1 AND (v_res->>'eventuais_reconhecidos')::int = 1 THEN
    v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 2 contagem de eventuais: ' || v_res::text; END IF;

  -- 2) O eventual faturado mantem o mesmo id (chave do motor)
  SELECT count(*) INTO v_n FROM public.series_eventuals WHERE id = v_e1;
  IF v_n = 1 THEN v_passed := v_passed + 1; ELSE v_failed := v_failed || E'\n  FAIL 3 eventual faturado foi apagado'; END IF;

  -- 3) Reenviar a mesma lista nao duplica o eventual faturado
  v_res := public.salvar_regras_contrato(v_series,
    '[{"month_from":1,"month_to":null,"amount":2995}]'::jsonb,
    '[{"label":"Protegido teste","total":300,"installments":1,"first_due_date":"2099-06-05"},
      {"label":"Novo teste","total":900,"installments":3,"first_due_date":"2099-07-05"}]'::jsonb);
  SELECT count(*) INTO v_n FROM public.series_eventuals WHERE series_id = v_series AND label = 'Protegido teste';
  IF v_n = 1 THEN v_passed := v_passed + 1; ELSE v_failed := v_failed || E'\n  FAIL 4 eventual faturado duplicado: ' || v_n; END IF;

  -- 4) Eventual faturado sai da lista: continua existindo (nao da para apagar cobranca emitida)
  v_res := public.salvar_regras_contrato(v_series,
    '[{"month_from":1,"month_to":null,"amount":2995}]'::jsonb, '[]'::jsonb);
  SELECT count(*) INTO v_n FROM public.series_eventuals WHERE id = v_e1;
  IF v_n = 1 THEN v_passed := v_passed + 1; ELSE v_failed := v_failed || E'\n  FAIL 5 eventual faturado removido ao sair da lista'; END IF;

  -- 5) Eventual sem fatura ("Novo teste") sai da lista e e apagado
  SELECT count(*) INTO v_n FROM public.series_eventuals WHERE series_id = v_series AND label = 'Novo teste';
  IF v_n = 0 THEN v_passed := v_passed + 1; ELSE v_failed := v_failed || E'\n  FAIL 6 eventual sem fatura nao foi removido'; END IF;

  -- 6) Regra com valor invalido e recusada
  BEGIN
    PERFORM public.salvar_regras_contrato(v_series, '[{"month_from":1,"month_to":null}]'::jsonb, '[]'::jsonb);
    v_failed := v_failed || E'\n  FAIL 7 regra sem valor foi aceita';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%sem valor%' THEN v_passed := v_passed + 1;
    ELSE v_failed := v_failed || E'\n  FAIL 7 erro inesperado: ' || SQLERRM; END IF;
  END;

  -- 7) Regras com buraco: o trigger deferido recusa no commit (aqui, na propria transacao via SET CONSTRAINTS)
  BEGIN
    SET CONSTRAINTS ALL IMMEDIATE;
    PERFORM public.salvar_regras_contrato(v_series,
      '[{"month_from":1,"month_to":3,"amount":100},{"month_from":5,"month_to":null,"amount":200}]'::jsonb, '[]'::jsonb);
    v_failed := v_failed || E'\n  FAIL 8 regras com buraco foram aceitas';
  EXCEPTION WHEN OTHERS THEN
    v_passed := v_passed + 1;
  END;
  SET CONSTRAINTS ALL DEFERRED;

  IF v_failed = '' THEN
    RAISE EXCEPTION 'SALVAR REGRAS OK — % passed, 0 failed (transacao revertida)', v_passed;
  ELSE
    RAISE EXCEPTION 'SALVAR REGRAS FALHOU — % passed%', v_passed, v_failed;
  END IF;
END $$;
