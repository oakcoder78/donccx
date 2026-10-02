-- ============================================================================
-- Fixes to the lifecycle RPCs + "Cobrar mais N meses" as an RPC.
--
-- 1) reabrir_series deleted orphaned future billing_payments. That contradicts
--    the explicit decision to preserve every payment, including a prepaid month:
--    a payment is a financial fact and outlives the series being closed.
-- 2) set_nao_cobrar with a specific p_series_id mirrored the whole client as
--    nao_bilhetavel, dropping out of billing a client that still had other active
--    series. The client mirror only moves on a client-wide action.
-- 3) reativar_series with a specific p_series_id never re-mirrored the client, so
--    "reactivate" could leave the whole client out of billing.
-- 4) "Cobrar mais N meses" was a direct UPDATE from the browser; it becomes an RPC
--    so it sits under the same role gate as the other lifecycle actions.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) reabrir_series — no longer touches billing_payments
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reabrir_series(p_series_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_series public.contract_series%ROWTYPE;
  v_has_recorrencia boolean;
  v_inseridos integer := 0;
BEGIN
  SELECT * INTO v_series FROM public.contract_series WHERE id = p_series_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'série não encontrada' USING errcode = 'P0002';
  END IF;

  IF coalesce(public.get_user_role(), '') NOT IN ('admin','manager','finance','sales') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  -- Sem linha de recorrência não há o que replicar; o form exige o lançamento.
  SELECT EXISTS (
    SELECT 1 FROM public.contract_charges
    WHERE series_id = p_series_id AND kind = 'recorrencia'
  ) INTO v_has_recorrencia;

  IF NOT v_has_recorrencia THEN
    RAISE EXCEPTION 'Esta série não tem recorrência lançada. Cadastre o lançamento no contrato antes de reabrir.'
      USING errcode = '23514';
  END IF;

  UPDATE public.contract_series
  SET status = 'ativa',
      contract_renewal = CASE
        WHEN contract_months IS NOT NULL
          THEN (billing_start + make_interval(months => contract_months))::date
        ELSE NULL
      END
  WHERE id = p_series_id;

  -- Reconstrói a cauda apagada (ou apenas repõe a folga, se os meses ficaram).
  -- billing_payments NÃO é tocado: pagamento é fato financeiro e permanece,
  -- mesmo prepaid de um mês que a cauda apagada não cubra mais.
  v_inseridos := public.ensure_series_horizon(p_series_id);

  RETURN jsonb_build_object('ok', true, 'meses_lancados', v_inseridos);
END; $$;

-- ---------------------------------------------------------------------------
-- 2) set_nao_cobrar — client mirror only on a client-wide action
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_nao_cobrar(p_client_id integer, p_series_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_afetadas integer := 0;
BEGIN
  IF coalesce(public.get_user_role(), '') NOT IN ('admin','manager','finance','sales') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  IF p_series_id IS NOT NULL THEN
    UPDATE public.contract_series
    SET billing_status = 'nao_bilhetavel'
    WHERE id = p_series_id AND status = 'ativa';
    GET DIAGNOSTICS v_afetadas = ROW_COUNT;
    IF v_afetadas = 0 THEN
      RAISE EXCEPTION 'série não encontrada ou já encerrada' USING errcode = 'P0002';
    END IF;
    -- Série específica: o cliente continua Ativo, porque as outras séries seguem
    -- faturando. O espelho do cliente é herdado da série original, não do pedido.
    RETURN jsonb_build_object('ok', true, 'series_afetadas', v_afetadas);
  END IF;

  UPDATE public.contract_series
  SET billing_status = 'nao_bilhetavel'
  WHERE client_id = p_client_id AND status = 'ativa';
  GET DIAGNOSTICS v_afetadas = ROW_COUNT;

  -- Espelho no cliente (herdado do trigger check_billing_suspended_until).
  UPDATE public.clients
  SET billing_status = 'nao_bilhetavel'
  WHERE id = p_client_id;

  RETURN jsonb_build_object('ok', true, 'series_afetadas', v_afetadas);
END; $$;

-- ---------------------------------------------------------------------------
-- 3) reativar_series — mirror the client on the per-series path too
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reativar_series(p_client_id integer, p_series_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_afetadas integer := 0;
BEGIN
  IF coalesce(public.get_user_role(), '') NOT IN ('admin','manager','finance','sales') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  IF p_series_id IS NOT NULL THEN
    UPDATE public.contract_series
    SET billing_status = 'ativo'
    WHERE id = p_series_id AND billing_status <> 'ativo';
    GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  ELSE
    UPDATE public.contract_series
    SET billing_status = 'ativo'
    WHERE client_id = p_client_id AND billing_status <> 'ativo';
    GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  END IF;

  -- Espelho do cliente segue sempre a série original ativa. Sem isto, reativar
  -- uma série específica não trazia o cliente de volta para o faturamento.
  UPDATE public.clients c
  SET billing_status = coalesce((
        SELECT s.billing_status FROM public.contract_series s
        WHERE s.client_id = c.id AND s.kind = 'original' AND s.status = 'ativa'
        LIMIT 1
      ), 'ativo')
  WHERE c.id = p_client_id;

  RETURN jsonb_build_object('ok', true, 'series_reativadas', v_afetadas);
END; $$;

-- ---------------------------------------------------------------------------
-- 4) cobrar_mais_meses — bill for N more months starting today
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cobrar_mais_meses(p_series_id uuid, p_meses integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fim date;
  v_inseridos integer := 0;
BEGIN
  IF coalesce(public.get_user_role(), '') NOT IN ('admin','manager','finance','sales') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  IF p_meses IS NULL OR p_meses < 1 OR p_meses > 120 THEN
    RAISE EXCEPTION 'Informe de 1 a 120 meses.' USING errcode = '22023';
  END IF;

  PERFORM 1 FROM public.contract_series WHERE id = p_series_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'série não encontrada' USING errcode = 'P0002';
  END IF;

  -- Último dia do mês N meses à frente de hoje. billing_end é a data em que a
  -- cobrança para, e o horizonte de recorrência a usa como teto. Contar a partir
  -- de hoje (e não de billing_start) porque a série que chega aqui já está
  -- vencida: "mais 6 meses" são os 6 meses que ainda vão entrar.
  v_fim := (date_trunc('month', current_date) + make_interval(months => p_meses) + interval '1 month - 1 day')::date;

  UPDATE public.contract_series
  SET auto_renew = false,
      billing_end = v_fim
  WHERE id = p_series_id;

  v_inseridos := public.ensure_series_horizon(p_series_id);

  RETURN jsonb_build_object(
    'ok', true,
    'billing_end', v_fim,
    'meses_lancados', v_inseridos
  );
END; $$;

REVOKE ALL ON FUNCTION public.reabrir_series(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.set_nao_cobrar(int, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.reativar_series(int, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.cobrar_mais_meses(uuid, int) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.reabrir_series(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_nao_cobrar(int, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reativar_series(int, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cobrar_mais_meses(uuid, int) TO authenticated, service_role;