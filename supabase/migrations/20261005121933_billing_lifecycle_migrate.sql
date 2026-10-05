-- ============================================================================
-- Billing rebuild — Phase 3: migracao das RPCs de ciclo de vida
-- SDD: docs/sdd/financeiro-faturamento-sdd.md §6 Fase 3
-- Lifecycle SDD: docs/sdd/contract-series-lifecycle-sdd.md
--
-- As RPCs passam a operar sobre series_rules + invoices. As duas que so tocam
-- billing_status (reativar_series, set_nao_cobrar) NAO mudam — nao dependem de
-- contract_charges.
--
-- O que muda de conceito:
--
--   encerrar  — antes APAGAVA as linhas futuras de contract_charges (a projecao
--               materializada). No modelo novo nao existe projecao materializada:
--               fatura nasce quando a competencia fecha. Entao encerrar CANCELA
--               as faturas futuras ainda nao liquidadas e para de emitir pelo
--               status. Fatura com lancamento nao e cancelada — e fato.
--
--   reabrir   — antes chamava ensure_series_horizon para rematerializar a
--               projecao. Nao ha o que rematerializar: reabrir so devolve o
--               status e o contract_renewal. Nada e emitido retroativamente.
--
--   cobrar_mais_meses — antes estendia o billing_end E materializava. Agora so
--               estende o billing_end; o motor le a janela na hora de emitir.
--
-- ensure_series_horizon NAO e dropada nesta fase: o cron contract-series-sync e
-- o botao "Repor horizonte" ainda a chamam, e contract_charges so morre na
-- Fase 7. Ela deixa de ser chamada pelo ciclo de vida — que e o que importa.
--
-- LIMITACAO TRANSITORIA, de proposito: depois desta fase, uma acao de ciclo de
-- vida nao aparece no cockpit ANTIGO (que le contract_charges). A janela e
-- curta — a Fase 4 reescreve o cockpit — e dual-write seria puxadinho em um
-- modelo que esta morrendo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) encerrar_series
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.encerrar_series(
  p_series_id          uuid,
  p_remover_futuro     boolean DEFAULT true,
  p_eventual           jsonb   DEFAULT NULL,
  p_motivo             text    DEFAULT NULL,
  p_remover_mes_atual  boolean DEFAULT false
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

  IF v_series.status = 'encerrada' THEN
    RETURN jsonb_build_object('ok', true, 'ja_encerrada', true);
  END IF;

  IF coalesce(public.get_user_role(), '') NOT IN ('admin','manager','finance','sales') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
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

  -- "> mes atual" cancela so o que era projecao. "> mes anterior" cancela tambem
  -- o mes em curso, quando e isso que a pessoa pediu.
  v_cutoff := CASE WHEN coalesce(p_remover_mes_atual, false)
                   THEN to_char((date_trunc('month', current_date) - interval '1 month')::date, 'YYYY-MM')
                   ELSE to_char(current_date, 'YYYY-MM') END;

  -- reason NAO e tocado: ele descreve a serie (a renegociacao e por que ela
  -- existe), nao o ato de fechar. contract_months e preservado pelo mesmo
  -- motivo — e o registro do que foi contratado.
  UPDATE public.contract_series
  SET status = 'encerrada',
      contract_renewal = NULL,
      encerramento_motivo = coalesce(v_motivo, encerramento_motivo)
  WHERE id = p_series_id;

  IF p_remover_futuro THEN
    -- Fatura com lancamento nao e cancelada: pagamento e fato. Fatura emitida e
    -- nao liquidada fora da janela vira cancelada, com o motivo do encerramento.
    FOR v_inv IN
      SELECT i.id
      FROM public.invoices i
      WHERE i.series_id = p_series_id
        AND i.status = 'emitida'
        AND i.competencia > v_cutoff
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

  -- Eventual de encerramento (multa, acerto) vira FATURA, nao linha de projecao.
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

REVOKE ALL ON FUNCTION public.encerrar_series(uuid, boolean, jsonb, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.encerrar_series(uuid, boolean, jsonb, text, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) reabrir_series
-- ---------------------------------------------------------------------------
-- Nao ha projecao a rematerializar: reabrir devolve o status e o renewal, e
-- nada e emitido retroativamente. Exige regra cadastrada, porque uma serie sem
-- regra nao fatura nada (o motor devolve sem_regra) — reabrir seria um no-op
-- silencioso.

CREATE OR REPLACE FUNCTION public.reabrir_series(p_series_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_series public.contract_series%ROWTYPE;
  v_has_regra boolean;
BEGIN
  SELECT * INTO v_series FROM public.contract_series WHERE id = p_series_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'série não encontrada' USING errcode = 'P0002';
  END IF;

  IF coalesce(public.get_user_role(), '') NOT IN ('admin','manager','finance','sales') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.series_rules WHERE series_id = p_series_id
  ) INTO v_has_regra;

  IF NOT v_has_regra THEN
    RAISE EXCEPTION 'Esta série não tem recorrência lançada. Cadastre o lançamento no contrato antes de reabrir.'
      USING errcode = '23514';
  END IF;

  UPDATE public.contract_series
  SET status = 'ativa',
      contract_renewal = CASE
        WHEN contract_months IS NOT NULL
          THEN (billing_start + make_interval(months => contract_months))::date
        ELSE NULL
      END,
      encerramento_motivo = NULL
  WHERE id = p_series_id;

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.reabrir_series(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reabrir_series(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) cobrar_mais_meses
-- ---------------------------------------------------------------------------
-- So estende a janela. O motor le billing_end na hora de emitir (§3.4), entao
-- nao ha nada a materializar.

CREATE OR REPLACE FUNCTION public.cobrar_mais_meses(p_series_id uuid, p_meses integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_billing_start date;
  v_fim date;
BEGIN
  IF coalesce(public.get_user_role(), '') NOT IN ('admin','manager','finance','sales') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  IF p_meses IS NULL OR p_meses < 1 OR p_meses > 120 THEN
    RAISE EXCEPTION 'Informe de 1 a 120 meses.' USING errcode = '22023';
  END IF;

  SELECT billing_start INTO v_billing_start
  FROM public.contract_series WHERE id = p_series_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'série não encontrada' USING errcode = 'P0002';
  END IF;

  -- Ultimo dia do mes N meses a frente de hoje. billing_end e a data em que a
  -- cobranca para.
  v_fim := (date_trunc('month', current_date) + make_interval(months => p_meses) + interval '1 month - 1 day')::date;

  UPDATE public.contract_series
  SET auto_renew = false,
      billing_end = v_fim
  WHERE id = p_series_id;

  RETURN jsonb_build_object('ok', true, 'billing_end', v_fim);
END $$;

REVOKE ALL ON FUNCTION public.cobrar_mais_meses(uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cobrar_mais_meses(uuid, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) get_series_vencidas
-- ---------------------------------------------------------------------------
-- last_launched_month passa a ler invoices.competencia. meses_futuros conta
-- faturas emitidas a frente — no modelo novo nao ha projecao materializada,
-- entao o normal e 0, e o alerta e sobre o contrato vencido, nao sobre folga.

CREATE OR REPLACE FUNCTION public.get_series_vencidas()
RETURNS TABLE(
  client_id integer, client_name text, series_id uuid, series_label text,
  contract_start date, contract_renewal date, months_overdue integer,
  last_launched_month text, meses_futuros integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    s.client_id,
    coalesce(cl.fantasy_name, cl.name),
    s.id,
    s.label,
    s.billing_start,
    s.contract_renewal,
    (extract(year FROM age(date_trunc('month', current_date), date_trunc('month', s.contract_renewal)))::int * 12
     + extract(month FROM age(date_trunc('month', current_date), date_trunc('month', s.contract_renewal)))::int),
    (SELECT max(i.competencia) FROM public.invoices i
     WHERE i.series_id = s.id AND i.kind = 'recorrencia' AND i.status = 'emitida'),
    (SELECT count(*)::int FROM public.invoices i
     WHERE i.series_id = s.id AND i.kind = 'recorrencia' AND i.status = 'emitida'
       AND i.competencia > to_char(current_date, 'YYYY-MM'))
  FROM public.contract_series s
  JOIN public.clients cl ON cl.id = s.client_id
  WHERE s.status = 'ativa'
    AND s.contract_months IS NOT NULL
    AND s.contract_renewal IS NOT NULL
    AND NOT coalesce(s.auto_renew, false)
    AND s.billing_end IS NULL
    AND s.contract_renewal < current_date
  ORDER BY s.contract_renewal;
$$;

REVOKE ALL ON FUNCTION public.get_series_vencidas() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_series_vencidas() TO authenticated, service_role;
