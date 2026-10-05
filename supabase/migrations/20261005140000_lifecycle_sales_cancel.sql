-- ============================================================================
-- Billing rebuild — Phase 3, correcao: sales pode encerrar e cancelar pelo ciclo de vida
-- SDD: docs/sdd/contract-series-lifecycle-sdd.md
--
-- sales pode encerrar a serie (ja podia) e, pela mesma acao, cancelar as faturas
-- futuras que a negociacao pede. Antes, o cancelamento passava por cancel_invoice,
-- que exige can_write_billing (admin, manager, finance). Ele fica restrito: sales
-- continua SEM baixa, desconto, estorno ou cancelamento avulso.
--
-- Mecanismo: _cancel_lifecycle_invoice faz o cancelamento com a mesma auditoria
-- de cancel_invoice, mas sem a checagem de papel de financeiro. Quem chama e so
-- encerrar_series e cancelar_eventual_grupo, que conferem a propria role antes.
-- A funcao nao tem EXECUTE para ninguem fora do owner.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._cancel_lifecycle_invoice(p_invoice_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'cancelamento exige usuario autenticado (auditoria)' USING errcode = '22023';
  END IF;

  SELECT status INTO v_status FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'fatura nao encontrada' USING errcode = 'P0002';
  END IF;
  IF v_status = 'cancelada' THEN
    RETURN;
  END IF;

  UPDATE public.invoices
  SET status        = 'cancelada',
      cancelled_by  = auth.uid(),
      cancelled_at  = now(),
      cancel_reason = p_reason
  WHERE id = p_invoice_id;
END $$;

REVOKE ALL ON FUNCTION public._cancel_lifecycle_invoice(uuid, text) FROM public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- encerrar_series — mesmo contrato da 20261005130000; muda so o cancelamento
-- ---------------------------------------------------------------------------

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

  v_cutoff := CASE WHEN coalesce(p_remover_mes_atual, false)
                   THEN to_char((date_trunc('month', current_date) - interval '1 month')::date, 'YYYY-MM')
                   ELSE to_char(current_date, 'YYYY-MM') END;

  UPDATE public.contract_series
  SET status = 'encerrada',
      contract_renewal = NULL,
      encerramento_motivo = coalesce(v_motivo, encerramento_motivo)
  WHERE id = p_series_id;

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
      PERFORM public._cancel_lifecycle_invoice(
        v_inv.id,
        'Encerramento da série' || CASE WHEN v_motivo IS NOT NULL THEN ': ' || v_motivo ELSE ' (sem cobrança futura)' END
      );
      v_canceladas := v_canceladas + 1;
    END LOOP;
  END IF;

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
-- cancelar_eventual_grupo — sales tambem, pelo mesmo caminho de ciclo de vida
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancelar_eventual_grupo(
  p_installment_group uuid,
  p_reason            text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inv record;
  v_canceladas integer := 0;
BEGIN
  IF coalesce(public.get_user_role(), '') NOT IN ('admin','manager','finance','sales') THEN
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
    PERFORM public._cancel_lifecycle_invoice(v_inv.id, btrim(p_reason));
    v_canceladas := v_canceladas + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'parcelas_canceladas', v_canceladas);
END $$;

REVOKE ALL ON FUNCTION public.cancelar_eventual_grupo(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_eventual_grupo(uuid, text) TO authenticated, service_role;
