-- ============================================================================
-- Billing rebuild — Phase 1, hardening (pos-validacao)
-- SDD: docs/sdd/financeiro-faturamento-sdd.md §1.3, §1.12, §2.7, §2.10
--
-- Corrige achados da validacao da Fase 1 (ver docs/CHANGELOG-2026-10.md):
--   1. invoice_balance rodava com os privilegios do dono (postgres) e
--      contornava a RLS de invoices/invoice_entries. Agora security_invoker.
--   2. Funcoes SECURITY DEFINER de saldo/numeracao/delay estavam executaveis
--      por qualquer usuario logado. Revogadas — as chamadas internas rodam
--      como dono e nao dependem desse grant.
--   3. Corrida no saldo: duas operacoes simultaneas liam o mesmo saldo e
--      pagavam a maior. Agora a fatura e travada (FOR UPDATE) antes da leitura.
--   4. issue_invoice gastava numero de sequencia em conflito (idempotencia).
--   5. adjust_invoice aceitava valor zero; cancel_invoice aceitava fatura com
--      caixa registrado. Regras: zero nao existe (use cancelamento); cancelar
--      exige estorno previo dos pagamentos/descontos/baixas.
--   6. recorrencia sem series_id escapava do indice de unicidade (NULL != NULL).
--
-- Nao altera nenhuma migration anterior. Invoices esta vazia em producao, entao
-- as mudancas de schema e de comportamento nao afetam dados existentes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Saldo respeita a RLS de quem consulta
-- ---------------------------------------------------------------------------
ALTER VIEW public.invoice_balance SET (security_invoker = true);

-- ---------------------------------------------------------------------------
-- 2) Revogar execucao direta por authenticated
-- ---------------------------------------------------------------------------
-- assert_invoice_open devolvia o saldo na mensagem de erro para qualquer id;
-- invoice_state e refresh_client_delay_days contornavam a RLS; e
-- generate_invoice_number permitia consumir a sequencia fiscal de fora.
REVOKE EXECUTE ON FUNCTION public.assert_invoice_open(uuid, numeric, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.invoice_state(uuid)                      FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_invoice_number(int)             FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_client_delay_days(integer)       FROM authenticated;

-- ---------------------------------------------------------------------------
-- 3) Recorrencia exige serie (senao o indice unico nao deduplica)
-- ---------------------------------------------------------------------------
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_recorrencia_series_chk
  CHECK (kind <> 'recorrencia' OR series_id IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 4) assert_invoice_open — trava a fatura antes de ler o saldo
-- ---------------------------------------------------------------------------
-- VOLATILE: SELECT ... FOR UPDATE nao e permitido em funcao STABLE.
-- Duas operacoes sobre a mesma fatura passam a ser serializadas: a segunda
-- espera a primeira commitar e le o saldo ja reduzido.

CREATE OR REPLACE FUNCTION public.assert_invoice_open(p_invoice_id uuid, p_amount numeric, p_action text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.invoice_balance;
BEGIN
  PERFORM 1 FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;

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

REVOKE ALL ON FUNCTION public.assert_invoice_open(uuid, numeric, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_invoice_open(uuid, numeric, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5) reverse_entry — trava a fatura do alvo antes de somar os estornos
-- ---------------------------------------------------------------------------

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

  PERFORM 1 FROM public.invoices WHERE id = v_target.invoice_id FOR UPDATE;

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
-- 6) adjust_invoice — trava, e valor zero vira cancelamento
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 7) cancel_invoice — recusa fatura com caixa registrado
-- ---------------------------------------------------------------------------
-- Cancelar com pagamento deixaria dinheiro recebido contra um documento que
-- nao existe mais. O operador estorna antes; so entao cancela.

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

-- ---------------------------------------------------------------------------
-- 8) issue_invoice — nao gasta numero quando a competencia ja existe
-- ---------------------------------------------------------------------------
-- A pre-checagem evita o nextval na reemissao idempotente. O ON CONFLICT
-- continua valendo para a corrida entre duas emissoes simultaneas (esse caso
-- ainda pode gastar um numero, e e raro).

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

  IF EXISTS (
    SELECT 1 FROM public.invoices
    WHERE (p_kind = 'recorrencia' AND kind = 'recorrencia' AND status = 'emitida'
           AND series_id = p_series_id AND competencia = p_competencia)
       OR (p_installment_group IS NOT NULL
           AND installment_group = p_installment_group AND installment_no = p_installment_no)
  ) THEN
    RETURN NULL;
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
-- 9) discount_batch — trava as faturas antes de calcular a distribuicao
-- ---------------------------------------------------------------------------
-- Travamento em ordem de id para evitar deadlock entre lotes concorrentes.
-- Corpo identico ao da migration billing_rpcs, exceto pelo bloco de lock.

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

  PERFORM 1 FROM public.invoices
  WHERE id = ANY (p_invoice_ids)
  ORDER BY id
  FOR UPDATE;

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
