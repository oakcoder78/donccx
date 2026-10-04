-- ============================================================================
-- Billing rebuild — Phase 1, migration 3/3: RPCs
-- SDD: docs/sdd/financeiro-faturamento-sdd.md §2, §4.2-§4.7
--
-- Toda escrita em invoices e invoice_entries passa por aqui: as tabelas nao tem
-- policy de INSERT/UPDATE/DELETE para authenticated. O guard e can_write_billing(),
-- que aceita service_role (o motor de emissao e Edge Function sem auth.uid()).
--
-- Regras que valem em todas:
--   * valor zero ou negativo nao gera fatura (documento de R$ 0,00 e ruido)
--   * nao existe credito: nao se paga nem se desconta acima do saldo — o
--     caminho para valor divergente e adjust_invoice, com motivo e auditoria
--   * lancamento e imutavel: correcao e reverse_entry
-- ============================================================================

-- ---------------------------------------------------------------------------
-- issue_invoice — emite UMA fatura
-- ---------------------------------------------------------------------------
-- Idempotente por construcao: ON CONFLICT DO NOTHING cobre o indice parcial de
-- recorrencia (serie, competencia, so enquanto emitida) e o de parcelas
-- (grupo, numero). Retorna NULL quando ja existia — o motor de fechamento
-- (Fase 2) usa isso para rodar duas vezes sem duplicar.

CREATE OR REPLACE FUNCTION public.issue_invoice(
  p_client_id            integer,
  p_series_id            uuid,
  p_kind                 text,
  p_competencia          text,
  p_amount               numeric,
  p_due_date             date,
  p_description          text     DEFAULT NULL,
  p_installment_group    uuid     DEFAULT NULL,
  p_installment_no       smallint DEFAULT NULL,
  p_installments_total   smallint DEFAULT NULL,
  p_replaces_invoice_id  uuid     DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.can_write_billing() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'issue_invoice: valor zero ou negativo nao gera fatura' USING errcode = '22023';
  END IF;

  INSERT INTO public.invoices (
    number, client_id, series_id, kind, competencia, amount, due_date,
    description, installment_group, installment_no, installments_total,
    replaces_invoice_id, issued_by
  ) VALUES (
    public.generate_invoice_number(extract(year from current_date)::int),
    p_client_id, p_series_id, p_kind, p_competencia, p_amount, p_due_date,
    p_description, p_installment_group, p_installment_no, p_installments_total,
    p_replaces_invoice_id, auth.uid()
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.issue_invoice(integer, uuid, text, text, numeric, date, text, uuid, smallint, smallint, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.issue_invoice(integer, uuid, text, text, numeric, date, text, uuid, smallint, smallint, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Guardas comuns — fatura existe, esta emitida e o valor cabe no saldo
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_invoice_open(p_invoice_id uuid, p_amount numeric, p_action text)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.invoice_balance;
BEGIN
  SELECT * INTO v FROM public.invoice_balance WHERE id = p_invoice_id;
  IF v.id IS NULL THEN
    RAISE EXCEPTION '%: fatura nao encontrada', p_action USING errcode = 'P0002';
  END IF;
  IF v.status = 'cancelada' THEN
    RAISE EXCEPTION '%: fatura cancelada nao aceita lancamento', p_action USING errcode = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION '%: valor precisa ser positivo', p_action USING errcode = '22023';
  END IF;
  IF p_amount > v.balance THEN
    RAISE EXCEPTION '%: R$ % excede o saldo de R$ %. Para valor divergente use adjust_invoice.',
      p_action, p_amount, v.balance USING errcode = '22023';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.assert_invoice_open(uuid, numeric, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.assert_invoice_open(uuid, numeric, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- settle_invoice — pagamento (parcial permitido)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.settle_invoice(
  p_invoice_id   uuid,
  p_amount       numeric,
  p_happened_at  date,
  p_method       text,
  p_external_ref text DEFAULT NULL,
  p_note         text DEFAULT NULL,
  p_batch_id     uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.can_write_billing() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_method IS NULL OR p_method NOT IN ('pix','boleto','transferencia','cartao','dinheiro','outro') THEN
    RAISE EXCEPTION 'settle_invoice: forma de pagamento invalida' USING errcode = '22023';
  END IF;
  IF p_happened_at IS NULL THEN
    RAISE EXCEPTION 'settle_invoice: data do pagamento e obrigatoria' USING errcode = '22023';
  END IF;

  PERFORM public.assert_invoice_open(p_invoice_id, p_amount, 'settle_invoice');

  INSERT INTO public.invoice_entries
    (invoice_id, kind, amount, happened_at, method, external_ref, note, batch_id, created_by)
  VALUES
    (p_invoice_id, 'pagamento', p_amount, p_happened_at, p_method, p_external_ref, p_note, p_batch_id, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.settle_invoice(uuid, numeric, date, text, text, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.settle_invoice(uuid, numeric, date, text, text, text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- discount_invoice — desconto negociado numa fatura
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.discount_invoice(
  p_invoice_id uuid,
  p_amount     numeric,
  p_reason     text,
  p_batch_id   uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.can_write_billing() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'discount_invoice: motivo obrigatorio (minimo 10 caracteres)' USING errcode = '22023';
  END IF;

  PERFORM public.assert_invoice_open(p_invoice_id, p_amount, 'discount_invoice');

  INSERT INTO public.invoice_entries
    (invoice_id, kind, amount, happened_at, reason, note, batch_id, created_by)
  VALUES
    (p_invoice_id, 'desconto', p_amount, current_date, p_reason, p_reason, p_batch_id, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.discount_invoice(uuid, numeric, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.discount_invoice(uuid, numeric, text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- discount_batch — distribui um total entre faturas abertas
-- ---------------------------------------------------------------------------
-- Proporcional ao saldo, com teto no proprio saldo e o resto redistribuido
-- entre as que ainda comportam. Distribuicao IGUAL em valor foi descartada:
-- R$ 5.000 sobre faturas de R$ 1.000, R$ 2.000 e R$ 10.000 daria R$ 1.666,67
-- a cada uma, estourando as duas primeiras.
--
-- Se o total pedido excede a soma dos saldos, desconta tudo (nao ha credito).
-- Retorna a soma efetivamente descontada.

CREATE OR REPLACE FUNCTION public.discount_batch(
  p_invoice_ids uuid[],
  p_total       numeric,
  p_reason      text
) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_batch    uuid := gen_random_uuid();
  v_open     numeric;
  v_target   numeric;
  v_remaining numeric;
  v_round    integer := 0;
  v_row      record;
  v_alloc    numeric;
  v_total    numeric := 0;
BEGIN
  IF NOT public.can_write_billing() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'discount_batch: motivo obrigatorio (minimo 10 caracteres)' USING errcode = '22023';
  END IF;
  IF p_invoice_ids IS NULL OR array_length(p_invoice_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'discount_batch: nenhuma fatura selecionada' USING errcode = '22023';
  END IF;
  IF p_total IS NULL OR p_total <= 0 THEN
    RAISE EXCEPTION 'discount_batch: total precisa ser positivo' USING errcode = '22023';
  END IF;

  SELECT coalesce(sum(v.balance), 0) INTO v_open
  FROM public.invoice_balance v
  WHERE v.id = ANY (p_invoice_ids) AND v.status = 'emitida' AND v.balance > 0;

  IF v_open <= 0 THEN
    RAISE EXCEPTION 'discount_batch: nenhuma das faturas tem saldo' USING errcode = '22023';
  END IF;

  v_target := least(p_total, v_open);
  v_remaining := v_target;

  -- Alocacao proporcional iterativa: quem bate no teto sai da base de calculo e
  -- o restante e redistribuido entre os demais.
  LOOP
    EXIT WHEN v_remaining <= 0.005 OR v_round > 10;
    v_round := v_round + 1;

    SELECT coalesce(sum(v.balance), 0) INTO v_open
    FROM public.invoice_balance v
    WHERE v.id = ANY (p_invoice_ids) AND v.status = 'emitida' AND v.balance > 0
      AND v.balance > coalesce((
        SELECT sum(en.amount) FROM public.invoice_entries en
        WHERE en.invoice_id = v.id AND en.batch_id = v_batch AND en.kind = 'desconto'
      ), 0);

    EXIT WHEN v_open <= 0;

    FOR v_row IN
      SELECT v.id, v.balance - coalesce((
               SELECT sum(en.amount) FROM public.invoice_entries en
               WHERE en.invoice_id = v.id AND en.batch_id = v_batch AND en.kind = 'desconto'
             ), 0) AS room
      FROM public.invoice_balance v
      WHERE v.id = ANY (p_invoice_ids) AND v.status = 'emitida' AND v.balance > 0
    LOOP
      CONTINUE WHEN v_row.room <= 0;

      v_alloc := round(v_remaining * (v_row.room / v_open), 2);
      v_alloc := least(v_alloc, v_row.room);
      CONTINUE WHEN v_alloc <= 0;

      INSERT INTO public.invoice_entries
        (invoice_id, kind, amount, happened_at, reason, note, batch_id, created_by)
      VALUES
        (v_row.id, 'desconto', v_alloc, current_date, p_reason, p_reason, v_batch, auth.uid());

      v_remaining := v_remaining - v_alloc;
      v_total := v_total + v_alloc;
    END LOOP;
  END LOOP;

  -- Sobra de arredondamento: aplica o resto na fatura com maior folga.
  IF v_remaining > 0.005 THEN
    SELECT v.id INTO v_row FROM public.invoice_balance v
    WHERE v.id = ANY (p_invoice_ids) AND v.status = 'emitida' AND v.balance > 0
    ORDER BY v.balance DESC LIMIT 1;
    IF v_row.id IS NOT NULL THEN
      INSERT INTO public.invoice_entries
        (invoice_id, kind, amount, happened_at, reason, note, batch_id, created_by)
      VALUES (v_row.id, 'desconto', v_remaining, current_date, p_reason, p_reason, v_batch, auth.uid());
      v_total := v_total + v_remaining;
    END IF;
  END IF;

  RETURN round(v_total, 2);
END $$;

REVOKE ALL ON FUNCTION public.discount_batch(uuid[], numeric, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.discount_batch(uuid[], numeric, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- write_off_invoice — baixa por perda (incobravel)
-- ---------------------------------------------------------------------------
-- Tipo proprio, separado de desconto: perda e deducao negociada tem efeitos
-- contabeis distintos, e tratar tudo como desconto apaga a estatistica de
-- inadimplencia.

CREATE OR REPLACE FUNCTION public.write_off_invoice(
  p_invoice_id  uuid,
  p_amount      numeric,
  p_reason      text,
  p_happened_at date DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.can_write_billing() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'write_off_invoice: motivo obrigatorio (minimo 10 caracteres)' USING errcode = '22023';
  END IF;

  PERFORM public.assert_invoice_open(p_invoice_id, p_amount, 'write_off_invoice');

  INSERT INTO public.invoice_entries
    (invoice_id, kind, amount, happened_at, reason, note, created_by)
  VALUES
    (p_invoice_id, 'baixa', p_amount, coalesce(p_happened_at, current_date), p_reason, p_reason, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.write_off_invoice(uuid, numeric, text, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.write_off_invoice(uuid, numeric, text, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- reverse_entry — estorno de um lancamento
-- ---------------------------------------------------------------------------
-- O unico caminho de correcao. O trigger trg_validate_invoice_entry garante
-- mesma fatura, alvo nao-estorno e sem over-reversal. Valor padrao = o valor
-- integral do alvo.

CREATE OR REPLACE FUNCTION public.reverse_entry(
  p_entry_id    uuid,
  p_reason      text,
  p_amount      numeric DEFAULT NULL,
  p_happened_at date    DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target public.invoice_entries;
  v_already numeric;
  v_id uuid;
BEGIN
  IF NOT public.can_write_billing() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'reverse_entry: motivo obrigatorio (minimo 10 caracteres)' USING errcode = '22023';
  END IF;

  SELECT * INTO v_target FROM public.invoice_entries WHERE id = p_entry_id;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'reverse_entry: lancamento nao encontrado' USING errcode = 'P0002';
  END IF;
  IF v_target.kind = 'estorno' THEN
    RAISE EXCEPTION 'reverse_entry: nao se estorna um estorno' USING errcode = '22023';
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_already
  FROM public.invoice_entries WHERE reverses_id = p_entry_id;

  IF p_amount IS NULL OR p_amount = 0 THEN
    p_amount := v_target.amount - v_already;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'reverse_entry: lancamento ja estornado integralmente' USING errcode = '22023';
  END IF;
  IF v_already + p_amount > v_target.amount THEN
    RAISE EXCEPTION 'reverse_entry: excede o valor do lancamento original (R$ %)', v_target.amount USING errcode = '22023';
  END IF;

  INSERT INTO public.invoice_entries
    (invoice_id, kind, amount, happened_at, reason, reverses_id, created_by)
  VALUES
    (v_target.invoice_id, 'estorno', p_amount, coalesce(p_happened_at, current_date), p_reason, p_entry_id, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.reverse_entry(uuid, text, numeric, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reverse_entry(uuid, text, numeric, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- adjust_invoice — ajuste manual de valor
-- ---------------------------------------------------------------------------
-- A porta de saida da imutabilidade. Bloqueado abaixo do total ja liquidado:
-- isso criaria credito, que nao existe no processo.

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
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'adjust_invoice: motivo obrigatorio (minimo 10 caracteres)' USING errcode = '22023';
  END IF;
  IF p_new_amount IS NULL OR p_new_amount < 0 THEN
    RAISE EXCEPTION 'adjust_invoice: valor invalido' USING errcode = '22023';
  END IF;

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

-- ---------------------------------------------------------------------------
-- cancel_invoice — cancela uma fatura emitida por erro
-- ---------------------------------------------------------------------------
-- Nao apaga: documento financeiro tem trilha. Libera a competencia para a
-- substituta (o indice unico de recorrencia so vale para status='emitida').
-- Lancamentos existentes permanecem — sao fatos.

CREATE OR REPLACE FUNCTION public.cancel_invoice(
  p_invoice_id uuid,
  p_reason     text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT public.can_write_billing() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'cancel_invoice: motivo obrigatorio (minimo 10 caracteres)' USING errcode = '22023';
  END IF;

  SELECT status INTO v_status FROM public.invoices WHERE id = p_invoice_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'cancel_invoice: fatura nao encontrada' USING errcode = 'P0002';
  END IF;
  IF v_status = 'cancelada' THEN
    RAISE EXCEPTION 'cancel_invoice: fatura ja cancelada' USING errcode = '22023';
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
