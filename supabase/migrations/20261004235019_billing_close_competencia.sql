-- ============================================================================
-- Billing rebuild — Phase 2: o motor de emissao
-- Superado por 20261004235417 e 20261005000046. Mantido como registro da sequencia.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.close_competencia(
  p_competencia text,
  p_mode        text    DEFAULT 'preview',
  p_force       boolean DEFAULT false,
  p_series_ids  uuid[]  DEFAULT NULL
)
RETURNS TABLE(
  series_id      uuid,
  client_id      integer,
  client_name    text,
  series_label   text,
  kind           text,
  outcome        text,
  reason         text,
  month_index    integer,
  uso            bigint,
  piso           integer,
  unit           numeric,
  base           numeric,
  excedente      numeric,
  amount         numeric,
  due_date       date,
  invoice_id     uuid,
  invoice_number text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cutover    text := '2026-11';
  v_f0         boolean;
  v_s          record;
  v_ev         record;
  v_i          integer;
  v_mi         integer;
  v_mode       text;
  v_ramount    numeric;
  v_rpercent   numeric;
  v_lic        bigint;
  v_os         bigint;
  v_tem_snap   boolean;
  v_tem_pend   boolean;
  v_uso        bigint;
  v_piso       integer;
  v_unit       numeric;
  v_base       numeric;
  v_exc        numeric;
  v_amt        numeric;
  v_due        date;
  v_inv        uuid;
  v_per        numeric;
  v_emitidas   integer := 0;
  v_puladas    integer := 0;
  v_ja         integer := 0;
BEGIN
  IF NOT public.can_write_billing() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  IF p_competencia IS NULL OR p_competencia !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'close_competencia: competencia invalida (esperado YYYY-MM)' USING errcode = '22023';
  END IF;
  IF p_mode NOT IN ('preview','real') THEN
    RAISE EXCEPTION 'close_competencia: modo invalido (preview|real)' USING errcode = '22023';
  END IF;

  IF p_mode = 'real' AND p_competencia < v_cutover THEN
    SELECT coalesce(ff.enabled, false) INTO v_f0
    FROM public.feature_flags ff WHERE ff.key = 'billing_f0_approved';
    IF NOT coalesce(v_f0, false) THEN
      RAISE EXCEPTION 'close_competencia: competencia % e anterior ao corte (%) e exige o F0 aprovado',
        p_competencia, v_cutover USING errcode = '22023';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('close_competencia:' || p_competencia));

  FOR v_s IN
    SELECT s.id, s.client_id, s.label, s.billing_type, s.billing_floor, s.billing_base_value,
           s.usage_driven, s.first_competencia, s.first_due_date, s.billing_end, s.contract_months,
           s.auto_renew, s.billing_status, s.billing_start,
           coalesce(c.fantasy_name, c.name) AS nome
    FROM public.contract_series s
    JOIN public.clients c ON c.id = s.client_id
    WHERE s.status = 'ativa'
      AND c.lifecycle_stage = 'cliente'
      AND (p_series_ids IS NULL OR s.id = ANY(p_series_ids))
    ORDER BY s.client_id, s.billing_start, s.id
  LOOP
    series_id := v_s.id; client_id := v_s.client_id; client_name := v_s.nome;
    series_label := v_s.label; kind := 'recorrencia';
    outcome := NULL; reason := NULL; month_index := NULL; uso := NULL; piso := NULL;
    unit := NULL; base := NULL; excedente := NULL; amount := NULL; due_date := NULL;
    invoice_id := NULL; invoice_number := NULL;

    v_mi := public.competencia_index(v_s.first_competencia, p_competencia);
    month_index := v_mi;

    IF p_competencia < v_s.first_competencia THEN
      outcome := 'pulada'; reason := 'antes_inicio';
    ELSIF v_s.billing_end IS NOT NULL AND (p_competencia || '-01')::date > v_s.billing_end THEN
      outcome := 'pulada'; reason := 'fora_janela';
    ELSIF v_s.billing_end IS NULL AND v_s.contract_months IS NOT NULL
          AND NOT v_s.auto_renew AND v_mi > v_s.contract_months THEN
      outcome := 'pulada'; reason := 'fora_janela';
    ELSIF v_s.billing_status = 'nao_bilhetavel' THEN
      outcome := 'pulada'; reason := 'nao_bilhetavel';
    ELSE
      SELECT r.mode, r.amount, r.percent INTO v_mode, v_ramount, v_rpercent
      FROM public.series_rules r
      WHERE r.series_id = v_s.id
        AND v_mi >= r.month_from
        AND (r.month_to IS NULL OR v_mi <= r.month_to)
      ORDER BY r.month_from
      LIMIT 1;

      IF v_mode IS NULL THEN
        outcome := 'pulada'; reason := 'sem_regra';
      ELSE
        v_lic := 0; v_os := 0; v_tem_snap := false; v_tem_pend := false;
        IF v_s.billing_type <> 'fixo' THEN
          SELECT u.uso_lic, u.uso_os, u.tem_snapshot, u.tem_pending
            INTO v_lic, v_os, v_tem_snap, v_tem_pend
          FROM public.billing_client_usage(p_competencia) u
          WHERE u.client_id = v_s.client_id;

          IF v_s.usage_driven AND NOT p_force
             AND (NOT coalesce(v_tem_snap, false) OR coalesce(v_tem_pend, false)) THEN
            outcome := 'pulada'; reason := 'usage_incomplete';
          END IF;
        END IF;

        IF outcome IS NULL THEN
          -- 'os' e 'por_os' sao a mesma base: o banco guarda a grafia antiga
          -- porque o engine vivo a le; o rename e da Fase 7.
          v_uso := CASE WHEN v_s.billing_type = 'os' THEN v_os ELSE v_lic END;
          v_piso := coalesce(v_s.billing_floor, 0);
          v_unit := coalesce(v_s.billing_base_value, 0);
          uso := v_uso; piso := v_piso; unit := v_unit;

          IF v_mode = 'percent' THEN
            v_base := round(v_rpercent / 100 * v_unit * greatest(v_piso, 1), 2);
          ELSE
            v_base := coalesce(v_ramount, 0);
          END IF;

          -- amount = base + excedente. O excedente e o uso acima do piso, a
          -- preco cheio; a base vem da faixa (amount, ou percent sobre
          -- unit x piso). So quando a faixa vale exatamente unit x piso isso
          -- coincide com unit x max(piso, uso) — uma faixa percentual nao
          -- pode ser ignorada.
          IF v_s.usage_driven AND v_s.billing_type <> 'fixo' THEN
            v_exc := round(greatest(0, v_uso - v_piso) * v_unit, 2);
            v_amt := round(v_unit * greatest(v_piso, v_uso), 2);
          ELSE
            v_exc := 0;
            v_amt := v_base;
          END IF;

          base := v_base; excedente := v_exc; amount := v_amt;

          IF v_amt <= 0 THEN
            outcome := 'pulada'; reason := 'valor_zero';
          ELSE
            v_due := public.billing_due_date(v_s.first_due_date, v_mi);
            due_date := v_due;

            IF p_mode = 'preview' THEN
              outcome := 'emitiria';
            ELSE
              v_inv := public.issue_invoice(v_s.client_id, v_s.id, 'recorrencia', p_competencia, v_amt, v_due);
              IF v_inv IS NULL THEN
                outcome := 'ja_emitida'; reason := 'idempotente';
                SELECT i.id, i.number INTO invoice_id, invoice_number
                FROM public.invoices i
                WHERE i.series_id = v_s.id AND i.competencia = p_competencia
                  AND i.kind = 'recorrencia' AND i.status = 'emitida';
              ELSE
                outcome := 'emitida';
                invoice_id := v_inv;
                SELECT i.number INTO invoice_number FROM public.invoices i WHERE i.id = v_inv;
              END IF;
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;

    IF outcome = 'emitida' OR outcome = 'emitiria' THEN v_emitidas := v_emitidas + 1;
    ELSIF outcome = 'ja_emitida' THEN v_ja := v_ja + 1;
    ELSE v_puladas := v_puladas + 1; END IF;

    IF p_mode = 'real' THEN
      INSERT INTO public.billing_run_log (competencia, series_id, outcome, reason, invoice_id, detail)
      VALUES (p_competencia, v_s.id, outcome, reason, invoice_id,
              jsonb_build_object('kind', 'recorrencia', 'month_index', v_mi, 'uso', uso,
                                 'piso', piso, 'unit', unit, 'base', base,
                                 'excedente', excedente, 'amount', amount, 'due_date', due_date));
    END IF;

    RETURN NEXT;
  END LOOP;

  FOR v_ev IN
    SELECT se.id, se.series_id, se.label, se.total, se.installments, se.first_due_date,
           s.client_id, s.label AS series_label,
           coalesce(c.fantasy_name, c.name) AS nome
    FROM public.series_eventuals se
    JOIN public.contract_series s ON s.id = se.series_id
    JOIN public.clients c ON c.id = s.client_id
    WHERE s.status = 'ativa'
      AND s.billing_status <> 'nao_bilhetavel'
      AND c.lifecycle_stage = 'cliente'
      AND (p_series_ids IS NULL OR s.id = ANY(p_series_ids))
    ORDER BY s.client_id, se.first_due_date, se.id
  LOOP
    FOR v_i IN 1..v_ev.installments LOOP
      v_due := (v_ev.first_due_date + make_interval(months => v_i - 1))::date;
      CONTINUE WHEN to_char(v_due, 'YYYY-MM') <> p_competencia;

      series_id := v_ev.series_id; client_id := v_ev.client_id; client_name := v_ev.nome;
      series_label := v_ev.series_label; kind := 'eventual';
      outcome := NULL; reason := NULL; month_index := NULL; uso := NULL; piso := NULL;
      unit := NULL; excedente := NULL; due_date := v_due;
      invoice_id := NULL; invoice_number := NULL;

      v_per := floor((v_ev.total / v_ev.installments) * 100) / 100;
      v_amt := CASE WHEN v_i = v_ev.installments
                    THEN round(v_ev.total - v_per * (v_ev.installments - 1), 2)
                    ELSE v_per END;
      base := v_amt; amount := v_amt;

      IF p_mode = 'preview' THEN
        outcome := 'emitiria';
        v_emitidas := v_emitidas + 1;
      ELSE
        v_inv := public.issue_invoice(v_ev.client_id, v_ev.series_id, 'eventual', p_competencia, v_amt, v_due,
                                      v_ev.label, v_ev.id, v_i::smallint, v_ev.installments::smallint);
        IF v_inv IS NULL THEN
          outcome := 'ja_emitida'; reason := 'idempotente'; v_ja := v_ja + 1;
          SELECT i.id, i.number INTO invoice_id, invoice_number
          FROM public.invoices i
          WHERE i.installment_group = v_ev.id AND i.installment_no = v_i;
        ELSE
          outcome := 'emitida'; v_emitidas := v_emitidas + 1;
          invoice_id := v_inv;
          SELECT i.number INTO invoice_number FROM public.invoices i WHERE i.id = v_inv;
        END IF;
      END IF;

      IF p_mode = 'real' THEN
        INSERT INTO public.billing_run_log (competencia, series_id, outcome, reason, invoice_id, detail)
        VALUES (p_competencia, v_ev.series_id, outcome, reason, invoice_id,
                jsonb_build_object('kind', 'eventual', 'label', v_ev.label,
                                   'installment_no', v_i, 'installments_total', v_ev.installments,
                                   'amount', v_amt, 'due_date', v_due));
      END IF;

      RETURN NEXT;
    END LOOP;
  END LOOP;

  IF p_mode = 'real' THEN
    INSERT INTO public.billing_run_log (competencia, series_id, outcome, reason, detail)
    VALUES (p_competencia, NULL, 'emitida', 'resumo',
            jsonb_build_object('emitidas', v_emitidas, 'ja_emitidas', v_ja, 'puladas', v_puladas,
                               'force', p_force, 'escopo', CASE WHEN p_series_ids IS NULL THEN 'todas' ELSE 'selecionadas' END));
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.close_competencia(text, text, boolean, uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.close_competencia(text, text, boolean, uuid[]) TO authenticated, service_role;
