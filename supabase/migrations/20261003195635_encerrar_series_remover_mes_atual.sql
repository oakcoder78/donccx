-- Fechar uma série no meio do mês deixava uma decisão sem pergunta: a cobrança do
-- mês corrente já foi emitida e ainda é cobrável, mas encerrar a tratava como se
-- fosse projeção junto com as futuras.
--
-- p_remover_mes_atual separa as duas coisas. Falso (padrão) mantém o mês em curso,
-- que é o que "encerrar a partir de novembro" significa para quem fecha em outubro.
-- Verdadeiro cancela também o mês corrente — para quem cancela dentro do mês e não
-- quer nada em aberto.
--
-- Pagamentos continuam intocados nos dois caminhos: a cobrança é cancelada, o que o
-- cliente já pagou não.
DROP FUNCTION IF EXISTS public.encerrar_series(uuid, boolean, jsonb, text);

CREATE FUNCTION public.encerrar_series(
  p_series_id uuid,
  p_remover_futuro boolean DEFAULT true,
  p_eventual jsonb DEFAULT NULL::jsonb,
  p_motivo text DEFAULT NULL::text,
  p_remover_mes_atual boolean DEFAULT false
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
    -- "> mes atual" remove só o que era projeção. "> mes anterior" remove também o
    -- mês em curso, quando é isso que a pessoa pediu.
    DELETE FROM public.contract_charges
    WHERE series_id = p_series_id
      AND kind = 'recorrencia'
      AND ref_month > CASE WHEN coalesce(p_remover_mes_atual, false)
                           THEN to_char((date_trunc('month', current_date) - interval '1 month')::date, 'YYYY-MM')
                           ELSE v_ref_atual END;
    GET DIAGNOSTICS v_removidos = ROW_COUNT;
  END IF;

  -- reason NAO e tocado: ele descreve a serie (a renegociacao e por que ela
  -- existe), nao o ato de fechar. contract_months e preservado pelo mesmo motivo
  -- — e o registro do que foi contratado.
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

REVOKE ALL ON FUNCTION public.encerrar_series(uuid, boolean, jsonb, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.encerrar_series(uuid, boolean, jsonb, text, boolean) TO authenticated, service_role;
