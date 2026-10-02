-- encerrar_series passed amount=0 or an empty reason straight to the table
-- CHECKs (contract_charges_amount_check / contract_charges_reason_check), which
-- raise 23514 without saying what was missing. Validating here turns that into a
-- usable message. month_index is now max over all kinds instead of recurrence
-- only, so a second eventual never reuses an index already taken.
CREATE OR REPLACE FUNCTION public.encerrar_series(p_series_id uuid, p_remover_futuro boolean DEFAULT true, p_eventual jsonb DEFAULT NULL::jsonb)
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

REVOKE ALL ON FUNCTION public.encerrar_series(uuid, boolean, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.encerrar_series(uuid, boolean, jsonb) TO authenticated, service_role;