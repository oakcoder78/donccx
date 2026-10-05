-- ============================================================================
-- Billing rebuild — Phase 3, correcao: escolha explicita no encerramento
-- SDD: docs/sdd/financeiro-faturamento-sdd.md §6 Fase 3
-- Lifecycle SDD: docs/sdd/contract-series-lifecycle-sdd.md
--
-- A migration 20261005121933 fez encerrar_series cancelar TODA fatura futura
-- nao liquidada, parcelas eventuais inclusive. O comportamento antigo so
-- apagava kind='recorrencia'; a parcela de implantacao parcelada sobrevivia.
--
-- A regra de cancelamento vem da negociacao, nao do sistema: pode ser cancelar
-- so a recorrencia, so o eventual, os dois, ou nenhum. Por isso o encerramento
-- recebe dois flags explicitos, ambos false por padrao.
--
--   p_remover_futuro      -> cancela a recorrencia futura nao liquidada
--   p_cancelar_eventuais  -> cancela as parcelas eventuais futuras nao liquidadas
--
-- Faturas com lancamento nunca sao canceladas: pagamento e fato.
--
-- Tambem: a checagem de papel passa a vir ANTES do retorno de ja_encerrada.
-- Antes, um papel sem permissao recebia ok=true numa serie ja encerrada.
--
-- Nova cancelar_eventual_grupo: cancela as parcelas futuras nao liquidadas de
-- um grupo de eventual numa acao so.
-- ============================================================================

DROP FUNCTION IF EXISTS public.encerrar_series(uuid, boolean, jsonb, text, boolean);

CREATE OR REPLACE FUNCTION public.encerrar_series(
  p_series_id          uuid,
  p_remover_futuro     boolean DEFAULT false,
  p_eventual           jsonb   DEFAULT NULL,
  p_motivo             text    DEFAULT NULL,
  p_remover_mes_atual  boolean DEFAULT false,
  p_cancelar_eventuais boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_series    public.contract_series%ROWTYPE;
  v_cutoff    text;
  v_amount    numeric;
  v_reason    text;
  v_motivo    text;
  v_canceladas integer := 0;
  v_eventual_id uuid;
  v_inv       record;
BEGIN
  SELECT * INTO v_series FROM public.contract_series WHERE id = p_series_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'série não encontrada' USING errcode = 'P0002';
  END IF;

  -- Papel antes de qualquer retorno: serie ja encerrada nao revela estado a quem
  -- nao pode encerrar.
  IF coalesce(public.get_user_role(), '') NOT IN ('admin','manager','finance','sales') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  IF v_series.status = 'encerrada' THEN
    RETURN jsonb_build_object('ok', true, 'ja_encerrada', true);
  END IF;

  IF p_eventual IS NOT NULL THEN
    v_amount := coalesce((p_eventual->>'amount')::numeric, 0);
    v_reason := nullif(btrim(p_eventual->>'reason'), '');
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'O valor da cobrança eventual precisa ser maior que zero.' USING errcode = '22023';
    END IF;
    IF v_reason IS NOT NULL AND char_length(v_reason) < 10 THEN
      RAISE EXCEPTION 'O motivo da cobrança eventual precisa de ao menos 10 caracteres.' USING errcode = '22023';
    END IF;
  END IF;

  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  IF v_motivo IS NOT NULL AND char_length(v_motivo) < 10 THEN
    RAISE EXCEPTION 'O motivo do encerramento precisa de ao menos 10 caracteres.' USING errcode = '22023';
  END IF;

  -- "> mes atual" cancela so o que era futuro. "> mes anterior" cancela tambem
  -- o mes em curso, quando e isso que a pessoa pediu.
  v_cutoff := CASE WHEN coalesce(p_remover_mes_atual, false)
                   THEN to_char((date_trunc('month', current_date) - interval '1 month')::date, 'YYYY-MM')
                   ELSE to_char(current_date, 'YYYY-MM') END;

  -- reason NAO e tocado: ele descreve a serie. contract_months e preservado: e o
  -- registro do que foi contratado.
  UPDATE public.contract_series
  SET status = 'encerrada',
      contract_renewal = NULL,
      encerramento_motivo = coalesce(v_motivo, encerramento_motivo)
  WHERE id = p_series_id;

  -- Cancelamento escolhido pela negociacao. Cada flag atinge um tipo de fatura.
  IF p_remover_futuro OR p_cancelar_eventuais THEN
    FOR v_inv IN
      SELECT i.id
      FROM public.invoices i
      WHERE i.series_id = p_series_id
        AND i.status = 'emitida'
        AND i.competencia > v_cutoff
        AND ((p_remover_futuro AND i.kind = 'recorrencia')
          OR (p_cancelar_eventuais AND i.kind = 'eventual'))
        AND NOT EXISTS (SELECT 1 FROM public.invoice_entries e WHERE e.invoice_id = i.id)
      ORDER BY i.competencia
    LOOP
      PERFORM public.cancel_invoice(
        v_inv.id,
        'Encerramento da série' || CASE WHEN v_motivo IS NOT NULL THEN ': ' || v_motivo ELSE ' (sem cobrança futura)' END
      );
      v_canceladas := v_canceladas + 1;
    END LOOP;
  END IF;

  -- Eventual de encerramento (multa, acerto) vira fatura.
  IF p_eventual IS NOT NULL THEN
    v_eventual_id := public.issue_invoice(
      v_series.client_id, p_series_id, 'eventual',
      to_char(current_date, 'YYYY-MM'), v_amount, current_date,
      p_eventual->>'label'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'faturas_canceladas', v_canceladas,
    'eventual_id', v_eventual_id
  );
END $$;

REVOKE ALL ON FUNCTION public.encerrar_series(uuid, boolean, jsonb, text, boolean, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.encerrar_series(uuid, boolean, jsonb, text, boolean, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- cancelar_eventual_grupo — cancela as parcelas futuras de um eventual, de uma vez
-- ---------------------------------------------------------------------------
-- Parcelas ja liquidadas ficam: pagamento e fato. O cancelamento usa
-- cancel_invoice por parcela, com a mesma auditoria.

CREATE OR REPLACE FUNCTION public.cancelar_eventual_grupo(
  p_installment_group uuid,
  p_reason            text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inv record;
  v_canceladas integer := 0;
BEGIN
  IF coalesce(public.get_user_role(), '') NOT IN ('admin','manager','finance') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'O motivo do cancelamento precisa de ao menos 10 caracteres.' USING errcode = '22023';
  END IF;

  FOR v_inv IN
    SELECT i.id
    FROM public.invoices i
    WHERE i.installment_group = p_installment_group
      AND i.status = 'emitida'
      AND i.competencia > to_char(current_date, 'YYYY-MM')
      AND NOT EXISTS (SELECT 1 FROM public.invoice_entries e WHERE e.invoice_id = i.id)
    ORDER BY i.installment_no
  LOOP
    PERFORM public.cancel_invoice(v_inv.id, btrim(p_reason));
    v_canceladas := v_canceladas + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'parcelas_canceladas', v_canceladas);
END $$;

REVOKE ALL ON FUNCTION public.cancelar_eventual_grupo(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_eventual_grupo(uuid, text) TO authenticated, service_role;
