-- O "Encerrar série" que já existia no form exige um motivo de >=10 caracteres e o
-- grava em contract_series.reason. A RPC não tinha parâmetro para ele, então o
-- form continuava pelo UPDATE cru — que não zera contract_renewal nem cancela a
-- cauda futura (o trigger re-derivava a renovação no save). Resultado: série
-- marcada como encerrada e ainda faturando.
--
-- Assinatura nova exige DROP: CREATE OR REPLACE não aceita parâmetro novo.
DROP FUNCTION IF EXISTS public.encerrar_series(uuid, boolean, jsonb);

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

  -- Motivo da renegociação vale no encerramento também: sem ele, a série fechada
  -- não carrega o porquê, que é o que alguém vai ler daqui a seis meses.
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

  UPDATE public.contract_series
  SET status = 'encerrada',
      contract_renewal = NULL,
      reason = coalesce(v_motivo, reason)
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

REVOKE ALL ON FUNCTION public.encerrar_series(uuid, boolean, jsonb, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.encerrar_series(uuid, boolean, jsonb, text) TO authenticated, service_role;
