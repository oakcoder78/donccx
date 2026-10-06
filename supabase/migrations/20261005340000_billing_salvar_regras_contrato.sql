-- ============================================================================
-- Gravacao das regras de recorrencia e dos eventuais no modelo novo, a partir da
-- aba Contratos (passo 1 da convergencia com o cockpit de faturamento).
--
-- Uma transacao: troca o conjunto de series_rules da serie e reconcilia os
-- series_eventuals. Regras: substituem tudo (faturas ja emitidas sao imutaveis,
-- entao so meses ainda nao fechados sao afetados).
--
-- Eventuais: o motor identifica cada parcela pelo id do series_eventuals
-- (invoices.installment_group). Por isso um eventual JA FATURADO nunca e apagado
-- nem recriado: se a tela o envia de novo, e reconhecido e mantido. Apenas os
-- eventuais sem nenhuma fatura sao substituidos.
--
-- p_rules:    [{ "month_from": 1, "month_to": 12 | null, "amount": 2995 }]
-- p_eventuais:[{ "label": "...", "total": 900, "installments": 3, "first_due_date": "2026-09-05" }]
-- ============================================================================

CREATE OR REPLACE FUNCTION public.salvar_regras_contrato(
  p_series_id uuid,
  p_rules     jsonb,
  p_eventuais jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r              jsonb;
  e              jsonb;
  v_regras       integer := 0;
  v_inseridos    integer := 0;
  v_mantidos     integer := 0;
  v_protegidos   integer;
BEGIN
  IF NOT public.can_write_billing() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  PERFORM 1 FROM public.contract_series WHERE id = p_series_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'série não encontrada' USING errcode = 'P0002';
  END IF;

  -- Regras: o conjunto inteiro e substituido. A validacao de cobertura
  -- (contiguidade de 1 ate o fim) acontece no commit, pelo trigger deferido.
  DELETE FROM public.series_rules WHERE series_id = p_series_id;
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_rules, '[]'::jsonb)) LOOP
    IF r->>'amount' IS NULL OR (r->>'amount')::numeric < 0 THEN
      RAISE EXCEPTION 'regra sem valor válido (mês %)', r->>'month_from' USING errcode = '22023';
    END IF;
    INSERT INTO public.series_rules (series_id, month_from, month_to, mode, amount, percent, created_by)
    VALUES (
      p_series_id,
      (r->>'month_from')::smallint,
      NULLIF(r->>'month_to', '')::smallint,
      'amount',
      (r->>'amount')::numeric,
      NULL,
      NULL
    );
    v_regras := v_regras + 1;
  END LOOP;

  -- Eventuais: remove so os que nao tem fatura emitida ou cancelada.
  DELETE FROM public.series_eventuals se
  WHERE se.series_id = p_series_id
    AND NOT EXISTS (SELECT 1 FROM public.invoices i WHERE i.installment_group = se.id);

  -- Os que sobraram sao protegidos (ja faturados). Quem chega na lista com o
  -- mesmo conteudo e reconhecido e nao e inserido de novo.
  SELECT count(*) INTO v_protegidos FROM public.series_eventuals se WHERE se.series_id = p_series_id;

  FOR e IN SELECT * FROM jsonb_array_elements(coalesce(p_eventuais, '[]'::jsonb)) LOOP
    IF EXISTS (
      SELECT 1 FROM public.series_eventuals se
      WHERE se.series_id = p_series_id
        AND se.label = e->>'label'
        AND se.total = (e->>'total')::numeric
        AND se.installments = (e->>'installments')::smallint
        AND se.first_due_date = (e->>'first_due_date')::date
    ) THEN
      v_mantidos := v_mantidos + 1;
    ELSE
      INSERT INTO public.series_eventuals (series_id, label, total, installments, first_due_date, created_by)
      VALUES (
        p_series_id,
        e->>'label',
        (e->>'total')::numeric,
        (e->>'installments')::smallint,
        (e->>'first_due_date')::date,
        NULL
      );
      v_inseridos := v_inseridos + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'regras', v_regras,
    'eventuais_inseridos', v_inseridos,
    'eventuais_reconhecidos', v_mantidos,
    'eventuais_protegidos_existentes', v_protegidos
  );
END $$;

REVOKE ALL ON FUNCTION public.salvar_regras_contrato(uuid, jsonb, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.salvar_regras_contrato(uuid, jsonb, jsonb) TO authenticated, service_role;
