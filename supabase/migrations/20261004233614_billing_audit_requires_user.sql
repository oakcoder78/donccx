-- ============================================================================
-- Billing rebuild — Phase 1, follow-up: auditoria exige usuario
-- SDD: docs/sdd/financeiro-faturamento-sdd.md §1.5, §1.12
--
-- cancel_invoice e adjust_invoice gravam quem fez a acao (cancelled_by,
-- adjusted_by). Os CHECKs invoices_cancelled_fields e invoices_adjusted_fields
-- exigem essas colunas preenchidas. Sob service_role auth.uid() e NULL: a
-- chamada falhava com erro de CHECK, que nao explica nada ao operador.
--
-- Cancelar e ajustar sao acoes humanas com trilha. Sem usuario, recusa com
-- mensagem clara. Emissao (issue_invoice) continua aceitando service_role,
-- porque issued_by e nullable.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.adjust_invoice(
  p_invoice_id uuid,
  p_new_amount numeric,
  p_reason     text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.invoice_balance;
BEGIN
  IF NOT public.can_write_billing() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'adjust_invoice: ajuste exige usuario autenticado (auditoria)' USING errcode = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'adjust_invoice: motivo obrigatorio (minimo 10 caracteres)' USING errcode = '22023';
  END IF;
  IF p_new_amount IS NULL OR p_new_amount <= 0 THEN
    RAISE EXCEPTION 'adjust_invoice: valor precisa ser positivo — documento de zero nao existe, cancele a fatura' USING errcode = '22023';
  END IF;

  PERFORM 1 FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;

  SELECT * INTO v FROM public.invoice_balance WHERE id = p_invoice_id;
  IF v.id IS NULL THEN
    RAISE EXCEPTION 'adjust_invoice: fatura nao encontrada' USING errcode = 'P0002';
  END IF;
  IF v.status = 'cancelada' THEN
    RAISE EXCEPTION 'adjust_invoice: fatura cancelada' USING errcode = '22023';
  END IF;

  IF p_new_amount < (v.paid + v.discounted + v.written_off) THEN
    RAISE EXCEPTION 'adjust_invoice: R$ % fica abaixo do ja liquidado (R$ %). Estorne os lancamentos antes.',
      p_new_amount, (v.paid + v.discounted + v.written_off) USING errcode = '22023';
  END IF;

  UPDATE public.invoices
  SET adjusted_from = amount,
      amount        = p_new_amount,
      adjust_reason = p_reason,
      adjusted_by   = auth.uid(),
      adjusted_at   = now()
  WHERE id = p_invoice_id;
END $$;

REVOKE ALL ON FUNCTION public.adjust_invoice(uuid, numeric, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.adjust_invoice(uuid, numeric, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cancel_invoice(
  p_invoice_id uuid,
  p_reason     text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status  text;
  v_settled numeric;
BEGIN
  IF NOT public.can_write_billing() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'cancel_invoice: cancelamento exige usuario autenticado (auditoria)' USING errcode = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'cancel_invoice: motivo obrigatorio (minimo 10 caracteres)' USING errcode = '22023';
  END IF;

  SELECT status INTO v_status FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'cancel_invoice: fatura nao encontrada' USING errcode = 'P0002';
  END IF;
  IF v_status = 'cancelada' THEN
    RAISE EXCEPTION 'cancel_invoice: fatura ja cancelada' USING errcode = '22023';
  END IF;

  SELECT paid + discounted + written_off INTO v_settled
  FROM public.invoice_balance WHERE id = p_invoice_id;
  IF v_settled > 0 THEN
    RAISE EXCEPTION 'cancel_invoice: fatura tem R$ % liquidados. Estorne os lancamentos antes de cancelar.', v_settled
      USING errcode = '22023';
  END IF;

  UPDATE public.invoices
  SET status        = 'cancelada',
      cancelled_by  = auth.uid(),
      cancelled_at  = now(),
      cancel_reason = p_reason
  WHERE id = p_invoice_id;
END $$;

REVOKE ALL ON FUNCTION public.cancel_invoice(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cancel_invoice(uuid, text) TO authenticated, service_role;
