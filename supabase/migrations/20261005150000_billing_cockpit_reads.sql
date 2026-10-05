-- ============================================================================
-- Billing rebuild — Phase 4, passo 1: leituras do cockpit novo
-- SDD: docs/sdd/financeiro-faturamento-sdd.md §3.9, §4.1, §4.12
--
-- Leituras aditivas. A pagina atual continua com as RPCs antigas; estas sao
-- consumidas so pelo cockpit novo, atras da flag cockpit_faturamento.
--
--   billing_cockpit_clientes(competencia)   — uma linha por cliente com serie
--                                              ativa: com fatura ou sem fatura
--   billing_cockpit_faturas(cliente, comp)  — faturas do mes, eventuais inclusos
--   billing_pendencias(meses_atras)         — faturas vencidas com saldo
--   billing_cockpit_motivos(competencia)    — motivo e projecao por cliente sem
--                                              fatura, vindos do preview do motor
--
-- Guarda: can_read_billing() em todas. billing_cockpit_motivos chama o preview
-- do motor, que exige can_write_billing(), entao so quem escreve ve motivo e
-- projecao; leitura pura recebe motivo nulo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- billing_cockpit_clientes
-- ---------------------------------------------------------------------------
-- N = faturas emitidas nao quitadas na competencia; M = faturas emitidas
-- (canceladas nao contam). Saldo em aberto soma o saldo das emitidas.

CREATE OR REPLACE FUNCTION public.billing_cockpit_clientes(p_competencia text)
RETURNS TABLE(
  client_id     integer,
  client_name   text,
  series_ids    uuid[],
  estado        text,
  m_faturas     integer,
  n_em_aberto   integer,
  saldo_aberto  numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_read_billing() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_competencia IS NULL OR p_competencia !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'competencia invalida (esperado YYYY-MM)' USING errcode = '22023';
  END IF;

  RETURN QUERY
  WITH ativos AS (
    SELECT s.client_id, array_agg(s.id ORDER BY s.id) AS series_ids
    FROM public.contract_series s
    JOIN public.clients c ON c.id = s.client_id
    WHERE s.status = 'ativa' AND c.lifecycle_stage = 'cliente'
    GROUP BY s.client_id
  ),
  fat AS (
    SELECT v.client_id,
           count(*)::int AS m,
           count(*) FILTER (WHERE v.balance > 0)::int AS n,
           coalesce(sum(v.balance), 0) AS saldo
    FROM public.invoice_balance v
    WHERE v.competencia = p_competencia AND v.status = 'emitida'
    GROUP BY v.client_id
  )
  SELECT a.client_id,
         coalesce(c.fantasy_name, c.name),
         a.series_ids,
         CASE WHEN coalesce(f.m, 0) > 0 THEN 'com_fatura' ELSE 'sem_fatura' END,
         coalesce(f.m, 0),
         coalesce(f.n, 0),
         coalesce(f.saldo, 0)
  FROM ativos a
  JOIN public.clients c ON c.id = a.client_id
  LEFT JOIN fat f ON f.client_id = a.client_id
  ORDER BY coalesce(c.fantasy_name, c.name);
END $$;

REVOKE ALL ON FUNCTION public.billing_cockpit_clientes(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_cockpit_clientes(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- billing_cockpit_faturas — faturas do mes de um cliente
-- ---------------------------------------------------------------------------
-- Eventuais aparecem como linhas proprias (tipo 'eventual', parcela n de m).

CREATE OR REPLACE FUNCTION public.billing_cockpit_faturas(p_client_id integer, p_competencia text)
RETURNS TABLE(
  invoice_id       uuid,
  number           text,
  kind             text,
  description      text,
  amount           numeric,
  due_date         date,
  paid             numeric,
  balance          numeric,
  state            text,
  overdue_days     integer,
  last_settlement  date,
  installment_no   smallint,
  installments_total smallint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_read_billing() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT v.id, v.number, v.kind, v.description, v.amount, v.due_date,
         v.paid, v.balance, v.state, v.overdue_days, v.last_settlement,
         v.installment_no, v.installments_total
  FROM public.invoice_balance v
  WHERE v.client_id = p_client_id
    AND v.competencia = p_competencia
    AND v.status = 'emitida'
  ORDER BY v.kind, v.due_date, v.installment_no NULLS FIRST, v.number;
END $$;

REVOKE ALL ON FUNCTION public.billing_cockpit_faturas(integer, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_cockpit_faturas(integer, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- billing_pendencias — inadimplencia: vencidas com saldo, janela de meses
-- ---------------------------------------------------------------------------
-- Entra em pendencia quando vencida e com saldo > 0 (§1.9). Quitada nunca.

CREATE OR REPLACE FUNCTION public.billing_pendencias(p_meses_atras integer DEFAULT 12)
RETURNS TABLE(
  client_id       integer,
  client_name     text,
  invoice_id      uuid,
  number          text,
  competencia     text,
  kind            text,
  due_date        date,
  balance         numeric,
  overdue_days    integer,
  overdue_amount  numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_read_billing() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_meses_atras IS NULL OR p_meses_atras < 1 OR p_meses_atras > 120 THEN
    RAISE EXCEPTION 'informe de 1 a 120 meses' USING errcode = '22023';
  END IF;

  RETURN QUERY
  SELECT v.client_id,
         coalesce(c.fantasy_name, c.name),
         v.id, v.number, v.competencia, v.kind, v.due_date, v.balance,
         v.overdue_days, v.overdue_amount
  FROM public.invoice_balance v
  JOIN public.clients c ON c.id = v.client_id
  WHERE v.status = 'emitida'
    AND v.balance > 0
    AND v.due_date < current_date
    AND v.competencia >= to_char(current_date - make_interval(months => p_meses_atras), 'YYYY-MM')
  ORDER BY v.overdue_days DESC, v.due_date;
END $$;

REVOKE ALL ON FUNCTION public.billing_pendencias(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_pendencias(integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- billing_cockpit_motivos — motivo e projecao de cada serie, do preview
-- ---------------------------------------------------------------------------
-- O preview do motor nao grava nada, mas exige can_write_billing(). Quem so le
-- nao recebe motivo: a funcao devolve zero linhas para ele, nao erro.

CREATE OR REPLACE FUNCTION public.billing_cockpit_motivos(p_competencia text)
RETURNS TABLE(
  client_id   integer,
  series_id   uuid,
  outcome     text,
  reason      text,
  amount      numeric
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_read_billing() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF NOT public.can_write_billing() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.client_id, p.series_id, p.outcome, p.reason, p.amount
  FROM public.close_competencia(p_competencia, 'preview', false, NULL) p
  WHERE p.series_id IS NOT NULL
    AND p.kind = 'recorrencia';
END $$;

REVOKE ALL ON FUNCTION public.billing_cockpit_motivos(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_cockpit_motivos(text) TO authenticated, service_role;
