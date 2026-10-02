-- ============================================================================
-- ensure_series_horizon: dois defeitos que só apareceram em teste real.
--
-- 1) O teto do prazo assinado nunca era aplicado no caso que mais importa.
--    A condição era `NOT auto_renew AND billing_end IS NOT NULL`. Mas "contrato
--    vence e renovação desligada" — que é literalmente a série vencida que o
--    alerta do cockpit mostra — tem renovação desligada e billing_end NULO. Nesse
--    caso o clamp era pulado e a folga corria até current+12, ignorando
--    contract_months: um contrato encerrado continuava sendo lançado.
--    Reproduzido na série de teste: 12 meses de contrato terminando em 2026-07
--    receberam recorrência até 2027-10.
--
-- 2) O cleanup do fim apagava pagamentos de meses futuros. Isso contraria o
--    §1.3 do SDD ("billing_payments nunca é apagado, inclusive o de meses
--    futuros") e com o clamp corrigido passaria a comer justamente o pagamento
--    prepaid de um mês cuja projeção foi cancelada. O motivo original — evitar
--    pagamento órfão quando o contrato encurta — não se sustenta: o pagamento é
--    fato financeiro e sobrevive ao encerramento da série, que é a regra que
--    reabrir_series já respeita.
--
-- Sobre os tetos: billing_end é um acordo explícito e pode ESTENDER o prazo
-- assinado — é o que "cobrar mais N meses" grava. Por isso, quando existe, ele
-- é o teto sozinho; contract_months só vira teto na ausência de billing_end.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ensure_series_horizon(p_series_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series public.contract_series%ROWTYPE;
  v_last   record;
  v_target date;
  v_folga  integer := 12;
  v_from   integer;
  v_to     integer;
  v_inserted integer := 0;
BEGIN
  -- row lock: the form save and the monthly job must not materialize at once
  SELECT * INTO v_series FROM public.contract_series WHERE id = p_series_id FOR UPDATE;
  IF NOT FOUND OR v_series.status <> 'ativa' THEN
    RETURN 0;
  END IF;

  -- last recurrence row is the template for the renewed months
  SELECT month_index, ref_month, mode, amount, percent, label
  INTO v_last
  FROM public.contract_charges
  WHERE series_id = p_series_id AND kind = 'recorrencia'
  ORDER BY month_index DESC
  LIMIT 1;

  -- series with no recurrence (tiers/eventuais only) do not roll month to month
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Horizon: current month + folga, so a failed run cannot open a hole. It takes
  -- v_folga consecutive failures to actually lose a month. Those future rows are
  -- inert — every consumer filters on an exact ref_month, so they never reach
  -- MRR, pendências or reports.
  v_target := (date_trunc('month', current_date) + make_interval(months => v_folga))::date;

  IF v_series.billing_end IS NOT NULL THEN
    -- Fim explícito: teto sozinho. Pode estender o prazo assinado, que é o que
    -- "cobrar mais N meses" registra — por isso contract_months não o limita.
    v_target := least(v_target, date_trunc('month', v_series.billing_end));
  ELSIF NOT coalesce(v_series.auto_renew, false) THEN
    -- Renovação desligada sem fim explícito: a cobrança para no fim do prazo
    -- assinado. Sem contract_months não há como saber onde parar, e inventar
    -- recorrência seria pior do que não materializar nada.
    IF v_series.contract_months IS NULL THEN
      RETURN 0;
    END IF;
    v_target := least(v_target,
      (date_trunc('month', v_series.billing_start)
        + make_interval(months => v_series.contract_months - 1))::date);
  END IF;

  -- month_index of the target, matching refMonth() in src/lib/contractRules.js.
  -- Both sides truncated to the first of the month so the day of billing_start
  -- cannot shift the index by one. age(a, b) returns a - b, hence target first.
  v_to := (extract(year FROM age(date_trunc('month', v_target),
                                 date_trunc('month', v_series.billing_start)))::int * 12
         + extract(month FROM age(date_trunc('month', v_target),
                                  date_trunc('month', v_series.billing_start)))::int) + 1;
  v_to := least(greatest(v_to, 1), 600);
  v_from := v_last.month_index + 1;

  IF v_to >= v_from THEN
    -- due_date is filled by trg_sync_charge_due_date, not here
    INSERT INTO public.contract_charges
      (client_id, series_id, kind, month_index, ref_month, mode, amount, percent, label)
    SELECT
      v_series.client_id,
      p_series_id,
      'recorrencia',
      g.mi,
      to_char(v_series.billing_start + make_interval(months => g.mi - 1), 'YYYY-MM'),
      v_last.mode,
      v_last.amount,
      v_last.percent,
      v_last.label
    FROM generate_series(v_from, v_to) AS g(mi);

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  -- Past months become adimplente by contract (Financeiro records real
  -- delinquency afterwards, month by month). A wrong billing_start invents
  -- months of billing and payment history — that is why billing_start needs
  -- care on the form. ref_month is 'YYYY-MM' text: parse via || '-01'.
  -- Future months are left alone on purpose: the folga must never pre-mark a
  -- payment that has not come due yet.
  INSERT INTO public.billing_payments
    (client_id, series_id, ref_month, status, delay_days, paid_at)
  SELECT
    c.client_id,
    c.series_id,
    c.ref_month,
    'adimplente',
    0,
    least(
      (date_trunc('month', (c.ref_month || '-01')::date)
        + (coalesce(v_series.due_day, 5) - 1) * make_interval(days => 1))::date,
      (date_trunc('month', (c.ref_month || '-01')::date) + make_interval(months => 1)
        - make_interval(days => 1))::date
    )
  FROM public.contract_charges c
  WHERE c.series_id = p_series_id
    AND c.kind = 'recorrencia'
    AND c.ref_month < to_char(current_date, 'YYYY-MM')
    AND NOT EXISTS (
      SELECT 1 FROM public.billing_payments bp
      WHERE bp.client_id = c.client_id
        AND bp.series_id = c.series_id
        AND bp.ref_month = c.ref_month
    );

  -- billing_payments is NOT touched beyond this point. It has no FK to
  -- contract_charges, so shortening a contract leaves payments for months that
  -- stopped existing — and that is correct: the payment was made, the projection
  -- it paid for is gone. Deleting the row would erase money that came in.
  RETURN v_inserted;
END; $$;

REVOKE ALL ON FUNCTION public.ensure_series_horizon(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ensure_series_horizon(uuid) TO authenticated, service_role;