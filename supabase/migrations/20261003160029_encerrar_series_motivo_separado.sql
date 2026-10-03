-- contract_series.reason fazia dois papeis: por que a renegociacao existe E por que
-- a serie foi encerrada. Encerrar sobrescrevia o primeiro pelo segundo, e o motivo
-- original da renegociacao era apagado para sempre. Reproduzido: "Desconto de 20%
-- por volume contratado" -> "Cliente pediu cancelamento do contrato".
--
-- Separado em duas colunas. `reason` continua descrevendo a serie (obrigatorio para
-- renegociacao, validado no form) e `encerramento_motivo` passa a descrever o ato
-- de fechar. O dialogo de encerramento grava no campo certo e a ficha da serie volta
-- a mostrar um motivo so.
--
-- Encerradas nao mantem este campo editavel na UI; o backfill e defensivo para um
-- contrato legado ja encerrado, onde nao ha como saber qual dos dois usos era.
ALTER TABLE public.contract_series
  ADD COLUMN IF NOT EXISTS encerramento_motivo text;

UPDATE public.contract_series s
SET encerramento_motivo = s.reason
WHERE s.status = 'encerrada' AND s.reason IS NOT NULL AND s.encerramento_motivo IS NULL;

-- encerrar_series deixa de mexer em reason.
CREATE OR REPLACE FUNCTION public.encerrar_series(
  p_series_id uuid,
  p_remover_futuro boolean DEFAULT true,
  p_eventual jsonb DEFAULT NULL::jsonb,
  p_motivo text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_series public.contract_series%ROWTYPE;
  v_ref_atual text := to_char(current_date, 'YYYY-MM');
  v_removidos integer := 0;
  v_eventual_id uuid;
  v_amount numeric;
  v_reason text;
  v_motivo text;
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

  IF p_remover_futuro THEN
    DELETE FROM public.contract_charges
    WHERE series_id = p_series_id
      AND kind = 'recorrencia'
      AND ref_month > v_ref_atual;
    GET DIAGNOSTICS v_removidos = ROW_COUNT;
  END IF;

  -- reason NAO e tocado: ele descreve a serie (a renegociacao e por que ela
  -- existe), nao o ato de fechar. contract_months e preservado pelo mesmo
  -- motivo — e o registro do que foi contratado.
  UPDATE public.contract_series
  SET status = 'encerrada',
      contract_renewal = NULL,
      encerramento_motivo = coalesce(v_motivo, encerramento_motivo)
  WHERE id = p_series_id;

  IF p_eventual IS NOT NULL THEN
    INSERT INTO public.contract_charges
      (client_id, series_id, kind, month_index, ref_month, due_date, mode, amount, percent, label, reason)
    VALUES
      (v_series.client_id, p_series_id, 'implantacao',
       coalesce((SELECT max(c.month_index) FROM public.contract_charges c
                 WHERE c.series_id = p_series_id), 0) + 1,
       v_ref_atual,
       current_date,
       'absolute',
       v_amount,
       NULL,
       p_eventual->>'label',
       v_reason)
    RETURNING id INTO v_eventual_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'meses_removidos', v_removidos,
    'eventual_id', v_eventual_id
  );
END; $$;

-- reabrir limpa o motivo do encerramento pelo mesmo motivo que recalcula a
-- renovacao: os dois descrevem o estado ATUAL da serie. Reaberta, a serie nao esta
-- mais encerrada, e um motivo de encerramento ali seria mentira.
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
      END,
      encerramento_motivo = NULL
  WHERE id = p_series_id;

  v_inseridos := public.ensure_series_horizon(p_series_id);

  RETURN jsonb_build_object('ok', true, 'meses_lancados', v_inseridos);
END; $$;

REVOKE ALL ON FUNCTION public.encerrar_series(uuid, boolean, jsonb, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.reabrir_series(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.encerrar_series(uuid, boolean, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reabrir_series(uuid) TO authenticated, service_role;