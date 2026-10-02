-- Contract series lifecycle: the four lifecycle actions + the expired-series alert.
--
-- Every action is a SECURITY DEFINER RPC rather than a client-side UPDATE because
-- each one is a multi-row decision (cascade the status, rebuild the horizon,
-- mirror the client) that must not be half-applied by a browser error, and because
-- the role gate belongs on the server: the feature flag hides the buttons, but a
-- flag is not an authorization check.
--
-- Shared invariants across these functions:
--   * contract_charges rows are planned amounts. billing_payments rows are facts.
--     Nothing here ever deletes a payment.
--   * status lives on the series; clients.billing_status is a mirror that follows
--     the original series.
--   * access follows series_write: admin, manager, finance, sales.

-- ─── Alerta de séries vencidas ────────────────────────────────────────────────
-- A series whose signed term is over and that is not rolling month-to-month has
-- stopped being billed, and stopped being visible in the cockpit too. This makes
-- that state explicit so a human decides its fate.
CREATE OR REPLACE FUNCTION public.get_series_vencidas()
RETURNS TABLE(
  client_id int,
  client_name text,
  series_id uuid,
  series_label text,
  contract_start date,
  contract_renewal date,
  months_overdue int,
  last_launched_month text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.client_id,
    coalesce(cl.fantasy_name, cl.name),
    s.id,
    s.label,
    s.billing_start,
    s.contract_renewal,
    (extract(year FROM age(date_trunc('month', current_date), date_trunc('month', s.contract_renewal)))::int * 12
     + extract(month FROM age(date_trunc('month', current_date), date_trunc('month', s.contract_renewal)))::int),
    (SELECT max(c.ref_month)
     FROM public.contract_charges c
     WHERE c.series_id = s.id AND c.kind = 'recorrencia')
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

-- ─── Encerrar série ──────────────────────────────────────────────────────────
-- p_remover_futuro controls the horizon tail: those months are projection, not
-- something anyone agreed to pay, so the default is to drop them. Both choices
-- are reversible because reabrir_series rebuilds the tail from the last
-- recurrence row. contract_months is kept — it is the signed term, part of the
-- client's history, and dropping it would erase what was actually contracted.
CREATE OR REPLACE FUNCTION public.encerrar_series(
  p_series_id uuid,
  p_remover_futuro boolean DEFAULT true,
  p_eventual jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series public.contract_series%ROWTYPE;
  v_ref_atual text := to_char(current_date, 'YYYY-MM');
  v_removidos integer := 0;
  v_eventual_id uuid;
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

  IF p_remover_futuro THEN
    DELETE FROM public.contract_charges
    WHERE series_id = p_series_id
      AND kind = 'recorrencia'
      AND ref_month > v_ref_atual;
    GET DIAGNOSTICS v_removidos = ROW_COUNT;
  END IF;

  UPDATE public.contract_series
  SET status = 'encerrada',
      contract_renewal = NULL
  WHERE id = p_series_id;

  IF p_eventual IS NOT NULL THEN
    INSERT INTO public.contract_charges
      (client_id, series_id, kind, month_index, ref_month, due_date, mode, amount, percent, label, reason)
    VALUES
      (v_series.client_id, p_series_id, 'implantacao',
       coalesce((SELECT max(c.month_index) FROM public.contract_charges c
                 WHERE c.series_id = p_series_id AND c.kind = 'recorrencia'), 0) + 1,
       v_ref_atual,
       current_date,
       'absolute',
       coalesce((p_eventual->>'amount')::numeric, 0),
       NULL,
       p_eventual->>'label',
       p_eventual->>'reason')
    RETURNING id INTO v_eventual_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'meses_removidos', v_removidos,
    'eventual_id', v_eventual_id
  );
END; $$;

-- ─── Reabrir série ───────────────────────────────────────────────────────────
-- Deliberately does not touch billing_payments: a payment is a financial fact and
-- survives the series being closed, including a prepaid month whose projected
-- charge no longer exists. Rebuilding the horizon is enough to make the series
-- coherent again.
CREATE OR REPLACE FUNCTION public.reabrir_series(p_series_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series public.contract_series%ROWTYPE;
  v_has_recorrencia boolean;
  v_inseridos integer := 0;
  v_ref_atual text := to_char(current_date, 'YYYY-MM');
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
  v_inseridos := public.ensure_series_horizon(p_series_id);

  -- Pagamentos de meses que deixaram de existir quando a série foi encerrada.
  DELETE FROM public.billing_payments bp
  WHERE bp.series_id = p_series_id
    AND bp.ref_month > v_ref_atual
    AND NOT EXISTS (
      SELECT 1 FROM public.contract_charges c
      WHERE c.series_id = bp.series_id AND c.ref_month = bp.ref_month
    );

  RETURN jsonb_build_object('ok', true, 'meses_lancados', v_inseridos);
END; $$;

-- ─── Não cobrar ──────────────────────────────────────────────────────────────
-- p_series_id NULL means the whole client. Suspensão is not modelled here: a
-- temporary concession belongs in billing_exceptions, where the loss shows up in
-- the cockpit instead of the series silently reporting R$ 0.
CREATE OR REPLACE FUNCTION public.set_nao_cobrar(p_client_id integer, p_series_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  ELSE
    UPDATE public.contract_series
    SET billing_status = 'nao_bilhetavel'
    WHERE client_id = p_client_id AND status = 'ativa';
    GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  END IF;

  -- Espelho no cliente (herdado do trigger check_billing_suspended_until).
  UPDATE public.clients
  SET billing_status = 'nao_bilhetavel'
  WHERE id = p_client_id;

  RETURN jsonb_build_object('ok', true, 'series_afetadas', v_afetadas);
END; $$;

-- ─── Reativar ────────────────────────────────────────────────────────────────
-- The inverse: month-to-month billing resumes. Does not change series.status, so
-- a closed series stays closed.
CREATE OR REPLACE FUNCTION public.reativar_series(p_client_id integer, p_series_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

    -- Espelho do cliente segue a série original.
    UPDATE public.clients c
    SET billing_status = coalesce((
          SELECT s.billing_status FROM public.contract_series s
          WHERE s.client_id = c.id AND s.kind = 'original' AND s.status = 'ativa'
          LIMIT 1
        ), 'ativo')
    WHERE c.id = p_client_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'series_reativadas', v_afetadas);
END; $$;

REVOKE ALL ON FUNCTION public.get_series_vencidas() FROM public, anon;
REVOKE ALL ON FUNCTION public.encerrar_series(uuid, boolean, jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.reabrir_series(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.set_nao_cobrar(int, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.reativar_series(int, uuid) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.get_series_vencidas() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.encerrar_series(uuid, boolean, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reabrir_series(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_nao_cobrar(int, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reativar_series(int, uuid) TO authenticated, service_role;